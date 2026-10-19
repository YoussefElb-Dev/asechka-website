import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { checkedTrack, MusicError } from './music-catalog.js';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const endpoint = 'https://api.github.com/repos/YoussefElb-Dev/asechka-website/contents/dist/music.json';
export function checkedMusic(value) {
  const ranks = new Set(), songs = new Set();
  if (!value || value.version !== 1 || !Array.isArray(value.tracks) || value.tracks.length > 10) throw new MusicError('Our saved music needs a little attention. Nothing has been changed.');
  for (const track of value.tracks) {
    if (!checkedTrack(track) || !UUID.test(track.id) || !Number.isInteger(track.rank) || track.rank < 1 || track.rank > 10 ||
        ranks.has(track.rank) || songs.has(track.trackId) || typeof track.note !== 'string' || track.note.length > 500) throw new MusicError('Our saved music needs a little attention. Nothing has been changed.');
    ranks.add(track.rank); songs.add(track.trackId);
  }
  return value;
}
export function checkedChange(value) {
  if (!value || !['save', 'remove'].includes(value.action) || !Number.isInteger(value.rank) || value.rank < 1 || value.rank > 10 ||
      !(value.expectedId === null || typeof value.expectedId === 'string' && UUID.test(value.expectedId))) throw new MusicError('Choose a spot between 1 and 10 and try again.', 400);
  if (value.action === 'save' && (!Number.isSafeInteger(value.trackId) || value.trackId < 1 || typeof value.note !== 'string' || value.note.length > 500)) throw new MusicError('Choose a song and keep your little note under 500 characters.', 400);
  return { action: value.action, rank: value.rank, expectedId: value.expectedId, ...(value.action === 'save' ? { trackId: value.trackId, note: value.note.trim() } : {}) };
}
export function changeMusic(base, change, track, id = randomUUID()) {
  checkedMusic(base);
  const current = base.tracks.find(song => song.rank === change.rank);
  if (change.action === 'save' && current?.trackId === change.trackId && current.note === change.note) return { data: base, changed: false };
  if (change.action === 'remove' && !current) return { data: base, changed: false };
  if ((current?.id ?? null) !== change.expectedId) throw new MusicError('This spot just changed on the other screen. Refresh our list and choose again.', 409);
  if (change.action === 'save' && base.tracks.some(song => song.rank !== change.rank && song.trackId === change.trackId)) throw new MusicError('That song is already in our top 10. Choose a different one for this spot.', 400);
  const data = structuredClone(base);
  data.tracks = data.tracks.filter(song => song.rank !== change.rank);
  if (change.action === 'save') {
    if (!checkedTrack(track) || track.trackId !== change.trackId) throw new MusicError('Choose a song from the search results.', 400);
    data.tracks.push({ ...track, rank: change.rank, note: change.note, id });
  }
  data.tracks.sort((a, b) => a.rank - b.rank);
  data.updatedAt = new Date().toISOString();
  return { data, changed: true };
}
export class GitHubMusicStore {
  constructor({ token = () => process.env.MUSIC_GITHUB_TOKEN, fetcher = fetch, fallback = () => readFile(new URL('../dist/music.json', import.meta.url), 'utf8'), now = () => Date.now() } = {}) {
    this.token = token; this.fetcher = fetcher; this.fallback = fallback; this.now = now; this.cached = null;
  }
  get writable() { return !!this.token(); }
  async github(method, body) {
    let result;
    try {
      result = await this.fetcher(endpoint + (method === 'GET' ? '?ref=main' : ''), {
        method, signal: AbortSignal.timeout(10_000), cache: 'no-store',
        headers: { Authorization: `Bearer ${this.token()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json', 'User-Agent': 'Asechka-Music' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new MusicError('Saving music is taking a little longer. Your list is safe—please try again.'); }
    if (!result.ok) {
      if (method === 'PUT' && [409, 422].includes(result.status)) throw new MusicError('The music list changed while we were saving.', 409);
      throw new MusicError('Our shared music connection needs a little attention. Your list is safe—try again later.');
    }
    return result.json();
  }
  async read({ fresh = false } = {}) {
    if (!this.writable) return { data: checkedMusic(JSON.parse(await this.fallback())), sha: null };
    if (!fresh && this.cached?.until > this.now()) return this.cached.value;
    const file = await this.github('GET');
    if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string' || file.size > 100_000 || !/^[a-f0-9]{40}$/.test(file.sha)) throw new MusicError('Our saved music couldn’t be read. Nothing has been changed.');
    let data;
    try { data = checkedMusic(JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))); }
    catch { throw new MusicError('Our saved music couldn’t be read. Nothing has been changed.'); }
    const value = { data, sha: file.sha };
    this.cached = { value, until: this.now() + 5_000 };
    return value;
  }
  async change(input, track) {
    if (!this.writable) throw new MusicError('Saving our songs is still being connected. Search is ready—try saving again shortly.');
    const change = checkedChange(input), id = randomUUID();
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, sha } = await this.read({ fresh: true });
      const update = changeMusic(data, change, track, id);
      if (!update.changed) return data;
      try {
        await this.github('PUT', {
          message: change.action === 'remove' ? `Clear music spot ${change.rank} for Asechka` : `Save music spot ${change.rank} for Asechka`,
          branch: 'main', sha, content: Buffer.from(JSON.stringify(update.data, null, 2) + '\n').toString('base64'),
        });
        this.cached = null;
        return update.data;
      } catch (error) {
        this.cached = null;
        if (!(error instanceof MusicError) || error.status !== 409 || attempt === 2) throw error;
      }
    }
  }
}
