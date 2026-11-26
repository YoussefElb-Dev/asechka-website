import { handleVault } from '../server/vault-api.js';
import { handleJournal } from '../server/journal-api.js';
import { handleCamera } from '../server/camera-api.js';

export default {
  fetch: request => {
    const url = new URL(request.url);
    if (url.pathname === '/api/vault' || url.searchParams.get('__vault') === '1') return handleVault(request);
    return url.pathname === '/api/camera' || url.searchParams.get('__camera') === '1' ? handleCamera(request) : handleJournal(request);
  },
};
