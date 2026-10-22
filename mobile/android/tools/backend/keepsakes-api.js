import { authorize, privateHeaders } from './auth.js';
import { TogetherError } from './together-store.js';
import { GitHubKeepsakesStore } from './keepsakes-store.js';
const store = new GitHubKeepsakesStore();
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
export function createKeepsakesAPI({ collection = store } = {}) {
  return async request => {
    const denied = await authorize(request); if (denied) return denied;
    try {
      if (new URL(request.url).pathname !== '/api/keepsakes') return json({ error: 'Not found.' }, 404);
      if (request.method === 'GET') return json({ ...await collection.read(), writable: collection.writable });
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (Number(request.headers.get('content-length') || 0) > 70000) return json({ error: 'This little note is too long.' }, 413);
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 70000) return json({ error: 'This little note is too long.' }, 413);
      let input; try { input = JSON.parse(raw); } catch { return json({ error: 'Try saving this little note again.' }, 400); }
      return json({ ...await collection.change(input), writable: true });
    } catch (error) {
      return json({ error: error instanceof TogetherError ? error.message : 'Our little notes need a moment. Your words are safe.' }, error instanceof TogetherError ? error.status : 503);
    }
  };
}
export const handleKeepsakes = createKeepsakesAPI();
