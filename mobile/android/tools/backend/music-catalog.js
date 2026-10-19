export class MusicError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function trustedURL(value, artwork = false) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !(artwork ? host.endsWith('.mzstatic.com') : ['music.apple.com', 'itunes.apple.com'].includes(host))) return '';
    return url.href;
  } catch { return ''; }
}
export function normalizeTrack(raw) {
  if (!raw || raw.kind !== 'song' || !Number.isSafeInteger(raw.trackId) || raw.trackId < 1) return null;
  const title = text(raw.trackName, 300), artist = text(raw.artistName, 300);
  const trackUrl = trustedURL(raw.trackViewUrl);
  if (!title || !artist || !trackUrl) return null;
  const artwork = trustedURL(raw.artworkUrl100, true);
  return {
    trackId: raw.trackId, title, artist, album: text(raw.collectionName, 300),
    artworkUrl: artwork.replace(/\/100x100bb\.(jpg|png)(\?.*)?$/, '/600x600bb.$1$2'),
    trackUrl, durationMs: Number.isFinite(raw.trackTimeMillis) && raw.trackTimeMillis > 0 ? Math.min(raw.trackTimeMillis, 86_400_000) : 0,
  };
}
export function checkedTrack(track) {
  return track && Number.isSafeInteger(track.trackId) && track.trackId > 0 &&
    typeof track.title === 'string' && track.title.trim().length > 0 && track.title.length <= 300 &&
    typeof track.artist === 'string' && track.artist.trim().length > 0 && track.artist.length <= 300 &&
    typeof track.album === 'string' && track.album.length <= 300 &&
    typeof track.artworkUrl === 'string' && (!track.artworkUrl || !!trustedURL(track.artworkUrl, true)) &&
    !!trustedURL(track.trackUrl) && Number.isFinite(track.durationMs) && track.durationMs >= 0 && track.durationMs <= 86_400_000;
}
export class MusicCatalog {
  constructor({ fetcher = fetch, now = () => Date.now() } = {}) {
    this.fetcher = fetcher; this.now = now; this.cache = new Map(); this.pending = new Map(); this.calls = [];
  }
  async get(key, parameters) {
    const cached = this.cache.get(key);
    if (cached && cached.until > this.now()) return cached.tracks;
    if (this.pending.has(key)) return this.pending.get(key);
    this.calls = this.calls.filter(at => at > this.now() - 60_000);
    if (this.calls.length >= 18) throw new MusicError('Let’s give the music search a minute, then try again.', 429);
    this.calls.push(this.now());
    const load = (async () => {
      try {
        const response = await this.fetcher(`https://itunes.apple.com/${parameters}`, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
        if (!response.ok) throw new MusicError('The music catalog is taking a little break. Try again soon.', response.status === 429 ? 429 : 503);
        const result = await response.json();
        if (!Array.isArray(result.results)) throw new Error('Invalid catalog');
        const tracks = result.results.map(normalizeTrack).filter(Boolean);
        this.remember(key, tracks);
        for (const track of tracks) this.remember(`track:${track.trackId}`, [track]);
        return tracks;
      } catch (error) {
        if (error instanceof MusicError) throw error;
        throw new MusicError('We couldn’t reach the music catalog. Your saved songs are safe—try again shortly.');
      }
    })();
    this.pending.set(key, load);
    try { return await load; } finally { this.pending.delete(key); }
  }
  remember(key, tracks) {
    this.cache.delete(key);
    this.cache.set(key, { tracks, until: this.now() + 5 * 60_000 });
    while (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
  }
  search(query) {
    if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 120) throw new MusicError('Enter a song or artist between 2 and 120 characters.', 400);
    query = query.trim();
    return this.get(`search:${query.toLowerCase()}`, 'search?' + new URLSearchParams({ term: query, media: 'music', entity: 'song', country: 'US', limit: '20' }));
  }
  async track(id) {
    if (!Number.isSafeInteger(id) || id < 1) throw new MusicError('Choose a song from the search results.', 400);
    const tracks = await this.get(`track:${id}`, 'lookup?' + new URLSearchParams({ id: String(id), entity: 'song', country: 'US' }));
    const track = tracks.find(item => item.trackId === id);
    if (!track) throw new MusicError('That song isn’t available in the catalog anymore. Choose another version.', 404);
    return track;
  }
}
