import { authorize, privateHeaders } from './auth.js';
import { GitHubCameraStore, cameraView } from './camera-store.js';
import { TogetherError } from './together-store.js';
const store = new GitHubCameraStore();
export function createCameraAPI({ collection = store } = {}) {
  return async request => {
    // Rewrites share the journal function, but keep camera authorization separate.
    const url = new URL(request.url); url.pathname = '/api/camera'; url.searchParams.delete('__camera');
    request = new Request(url, request);
    const denied = await authorize(request); if (denied) return denied;
    const json = (body, status = 200) => Response.json(body, { status, headers: privateHeaders });
    try {
      if (request.method === 'GET') {
        if (url.searchParams.has('photo')) return new Response(await collection.photo(url.searchParams.get('photo')), { headers: { ...privateHeaders, 'Content-Type': 'image/jpeg' } });
        return json({ ...cameraView(await collection.read()), writable: collection.writable });
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (Number(request.headers.get('content-length') || 0) > 450000) return json({ error: 'Choose a smaller frame.' }, 413);
      const raw = await request.text(); if (Buffer.byteLength(raw) > 450000) return json({ error: 'Choose a smaller frame.' }, 413);
      let input; try { input = JSON.parse(raw); } catch { return json({ error: 'Try that shot again.' }, 400); }
      return json({ ...cameraView(await collection.change(input)), writable: true });
    } catch (error) { return json({ error: error instanceof TogetherError ? error.message : 'Our camera needs a moment. Try again with the same shot.' }, error instanceof TogetherError ? error.status : 503); }
  };
}
export const handleCamera = createCameraAPI();
