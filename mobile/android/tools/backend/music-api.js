import { authorize, privateHeaders } from './auth.js';
import { MusicCatalog, MusicError } from './music-catalog.js';
import { GitHubMusicStore, checkedChange } from './music-store.js';
const catalog = new MusicCatalog(), store = new GitHubMusicStore();
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8', ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
export function createMusicAPI({ catalog: songs = catalog, store: favorites = store } = {}) {
  return async request => {
    const denied = await authorize(request);
    if (denied) return denied;
    try {
      const path = new URL(request.url).pathname;
      if (path === '/api/music-search') {
        if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
        return json({ tracks: await songs.search(new URL(request.url).searchParams.get('q')) });
      }
      if (path !== '/api/music') return json({ error: 'Not found.' }, 404);
      if (request.method === 'GET') return json({ ...(await favorites.read()).data, writable: favorites.writable });
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (Number(request.headers.get('content-length') || 0) > 4096) return json({ error: 'That note is a little too long.' }, 413);
      const body = await request.text();
      if (Buffer.byteLength(body, 'utf8') > 4096) return json({ error: 'That note is a little too long.' }, 413);
      let input;
      try { input = JSON.parse(body); } catch { return json({ error: 'Choose a song and try again.' }, 400); }
      const change = checkedChange(input);
      if (!favorites.writable) throw new MusicError('Saving our songs is still being connected. Search is ready—try saving again shortly.');
      const track = change.action === 'save' ? await songs.track(change.trackId) : null;
      const data = await favorites.change(change, track);
      return json({ ...data, writable: true, message: change.action === 'save' ? 'Saved to our soundtrack ♡' : 'A little space for our next favorite.' });
    } catch (error) {
      return json({ error: error instanceof MusicError ? error.message : 'Our music is taking a little break. Please try again shortly.' }, error instanceof MusicError ? error.status : 503);
    }
  };
}
export const handleMusic = createMusicAPI();
