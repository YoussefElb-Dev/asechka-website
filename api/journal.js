import { handleJournal } from '../server/journal-api.js';
import { handleCamera } from '../server/camera-api.js';
export default { fetch: request => new URL(request.url).pathname === '/api/camera' || new URL(request.url).searchParams.get('__camera') === '1' ? handleCamera(request) : handleJournal(request) };
