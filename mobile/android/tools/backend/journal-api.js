import { authorize, privateHeaders } from './auth.js';
import { GitHubJournalStore } from './journal-store.js';
import { TogetherError } from './together-store.js';
const store = new GitHubJournalStore();
const json = (value, status = 200) => Response.json(value, { status, headers: privateHeaders });
export function createJournalAPI({ collection = store } = {}) {
  return async request => {
    const denied = await authorize(request); if (denied) return denied;
    try {
      const url = new URL(request.url);
      if (url.pathname !== '/api/journal') return json({ error: 'Not found.' }, 404);
      if (request.method === 'GET') {
        if (url.searchParams.has('photo')) return new Response(await collection.photo(url.searchParams.get('photo')), { headers: { ...privateHeaders, 'Content-Type': 'image/jpeg' } });
        return json({ ...await collection.read(), writable: collection.writable });
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (url.searchParams.has('photo')) return json({ error: 'Use the recipe editor to save photos.' }, 400);
      if (Number(request.headers.get('content-length') || 0) > 470000) return json({ error: 'Choose a smaller picture.' }, 413);
      const raw = await request.text(); if (Buffer.byteLength(raw) > 470000) return json({ error: 'Choose a smaller picture.' }, 413);
      let input; try { input = JSON.parse(raw); } catch { return json({ error: 'Try saving this entry again.' }, 400); }
      return json({ ...await collection.change(input), writable: true });
    } catch (error) {
      return json({ error: error instanceof TogetherError ? error.message : 'Our little book needs a moment. Your draft is still here.' }, error instanceof TogetherError ? error.status : 503);
    }
  };
}
export const handleJournal = createJournalAPI();
