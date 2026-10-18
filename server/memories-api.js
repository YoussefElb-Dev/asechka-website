import { authorize, privateHeaders } from './auth.js';
import { TogetherError } from './together-store.js';
import { GitHubMemoriesStore, editableMemories } from './memories-store.js';
const store = new GitHubMemoriesStore();
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
export function createMemoriesAPI({ collection = store } = {}) {
  return async request => {
    const denied = await authorize(request); if (denied) return denied;
    try {
      if (new URL(request.url).pathname !== '/api/memories') return json({ error: 'Not found.' }, 404);
      if (request.method === 'GET') return json({ ...editableMemories(await collection.read()), writable: collection.writable });
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (Number(request.headers.get('content-length') || 0) > 440000) return json({ error: 'Choose a smaller picture.' }, 413);
      const raw = await request.text();
      if (Buffer.byteLength(raw, 'utf8') > 440000) return json({ error: 'Choose a smaller picture.' }, 413);
      let input; try { input = JSON.parse(raw); } catch { return json({ error: 'Please try saving this memory again.' }, 400); }
      return json({ ...editableMemories(await collection.change(input)), writable: true });
    } catch (error) {
      return json({ error: error instanceof TogetherError ? error.message : 'Our shared collection needs a moment. Please try again.' }, error instanceof TogetherError ? error.status : 503);
    }
  };
}
export const handleMemories = createMemoriesAPI();
