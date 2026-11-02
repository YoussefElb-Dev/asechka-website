import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cameraView, checkedCamera, checkedCameraChange, changeCamera, GitHubCameraStore, cameraKey, sealFilm, openFilm, storedCamera } from '../server/camera-store.js';
import { createCameraAPI } from '../server/camera-api.js';
import { authorize } from '../server/auth.js';
const seed = () => ({ version: 1, rolls: [] });
const jpeg = 'data:image/jpeg;base64,' + Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,2,255,217]).toString('base64');
const draft = (action, extra = {}) => ({ action, operationId: randomUUID(), actor: 'asnat', ...extra });
const apply = (data, input) => changeCamera(data, checkedCameraChange(input), new Date('2026-11-02T20:00:00Z'));
const roll = () => { const input = draft('create', { title: 'Our ordinary days' }); return { input, data: apply(seed(), input).data, id: input.operationId }; };
const shot = id => draft('capture', { rollId: id, photo: jpeg, caption: 'A secret little note' });

test('repository copies contain authenticated ciphertext and never reveal pictures or captions', () => {
  const key = cameraKey('camera-fixture-encryption-secret-1234567890'), bytes = Buffer.from(jpeg.slice(23), 'base64');
  const first = sealFilm(bytes, key), second = sealFilm(bytes, key);
  assert(!first.equals(second)); assert(!first.includes(bytes)); assert.deepEqual(openFilm(first, key), bytes);
  const tampered = Buffer.from(first); tampered[tampered.length - 1] ^= 1;
  assert.throws(() => openFilm(tampered, key)); assert.throws(() => openFilm(first, cameraKey('a-different-camera-fixture-secret-1234567890')));
  assert.throws(() => cameraKey('too-short'));
  let { data, id } = roll(); data = apply(data, shot(id)).data;
  const stored = storedCamera(data, key); assert.equal(stored.rolls[0].shots[0].caption, undefined);
  assert(!JSON.stringify(stored).includes('A secret little note'));
  assert.equal(openFilm(Buffer.from(stored.rolls[0].shots[0].sealedCaption, 'base64'), key).toString(), 'A secret little note');
  assert.equal(data.rolls[0].shots[0].caption, 'A secret little note');
});

test('successful repository saves use one atomic tree and decrypt images only after development', async () => {
  const secret = 'camera-store-success-fixture-secret-1234567890', key = cameraKey(secret);
  let data = seed(), entries, encryptedPhoto, head = '1'.repeat(40), writes = 0;
  const store = new GitHubCameraStore({ token: () => 'test-only-token', secret: () => secret, fetcher: async (url, options) => {
    const path = new URL(url).pathname.split('/asechka-website')[1], body = options.body && JSON.parse(options.body); let result;
    if (path === '/git/ref/heads/main') result = { object: { sha: head } };
    else if (path === '/contents/private/camera.json') result = { type:'file', size:1000, encoding:'base64', sha:'3'.repeat(40), content:Buffer.from(JSON.stringify(storedCamera(data, key))).toString('base64') };
    else if (/^\/contents\/private\/camera\/.+\.bin$/.test(path)) result = { type:'file', size:encryptedPhoto.length, encoding:'base64', sha:'4'.repeat(40), content:encryptedPhoto.toString('base64') };
    else if (path.startsWith('/git/commits/') && options.method === 'GET') result = { tree: { sha:'2'.repeat(40) } };
    else if (path === '/git/blobs') { encryptedPhoto = Buffer.from(body.content, 'base64'); assert.deepEqual(openFilm(encryptedPhoto, key), Buffer.from(jpeg.slice(23), 'base64')); result = { sha:'4'.repeat(40) }; }
    else if (path === '/git/trees') { entries = body.tree; assert.equal(body.base_tree,'2'.repeat(40)); result = { sha:'5'.repeat(40) }; }
    else if (path === '/git/commits') result = { sha:'6'.repeat(40) };
    else if (path === '/git/refs/heads/main') { assert.equal(body.force,false); writes++; const saved=JSON.parse(entries[0].content); assert(!entries[0].content.includes('A secret little note')); data=structuredClone(saved); for(const roll of data.rolls)for(const shot of roll.shots){shot.caption=openFilm(Buffer.from(shot.sealedCaption,'base64'),key).toString();delete shot.sealedCaption;}head=body.sha;result={}; }
    else throw Error('Unexpected Git request '+path);
    return Response.json(result);
  } });
  const create = draft('create',{title:'Private even in a repository'}); await store.change(create);
  const capture = shot(create.operationId); await store.change(capture);
  assert.deepEqual(entries.map(entry=>entry.path),['private/camera.json',`private/camera/${capture.operationId}.bin`]);
  await store.change(capture); assert.equal(writes,2);
  await assert.rejects(()=>store.photo(capture.operationId), e=>e.status===404);
  for(let i=1;i<24;i++) data=apply(data,shot(create.operationId)).data;
  await store.change(draft('develop',{rollId:create.operationId}));
  assert.deepEqual(await store.photo(capture.operationId),Buffer.from(jpeg.slice(23),'base64'));
});

test('24 shots stay sealed, stable retries consume one slot, and development creates a revisitable album', () => {
  let { data, id, input } = roll(); assert.equal(apply(data, input).changed, false);
  assert.throws(() => apply(data, draft('create', { title: 'Another roll' })), e => e.status === 409);
  assert.throws(() => apply(data, draft('develop', { rollId: id })), e => e.status === 409);
  const first = shot(id); data = apply(data, first).data;
  assert.equal(apply(data, first).changed, false);
  assert.throws(() => apply(data, { ...first, caption: 'changed' }), e => e.status === 409);
  assert.throws(() => apply(data, { ...first, actor: 'youssef' }), e => e.status === 409);
  const publicShot = cameraView(data).rolls[0].shots[0];
  assert.deepEqual(Object.keys(publicShot).sort(), ['actor', 'createdAt', 'id']);
  assert(!JSON.stringify(cameraView(data)).includes('secret little note'));
  for (let i = 1; i < 24; i++) data = apply(data, { ...shot(id), actor: i % 2 ? 'youssef' : 'asnat' }).data;
  assert.equal(data.rolls[0].shots.length, 24);
  assert.throws(() => apply(data, shot(id)), e => e.status === 409);
  assert.throws(() => apply(data, draft('react', { rollId: id, shotId: first.operationId, reaction: '♡' })), e => e.status === 409);
  const develop = draft('develop', { rollId: id }); data = apply(data, develop).data;
  assert.equal(apply(data, develop).changed, false);
  assert.equal(apply(data, first).changed, false); // retry a successful shot after development
  const view = cameraView(data); assert.equal(view.rolls[0].shots[0].caption, first.caption); assert(!JSON.stringify(view).includes('hash'));
  const next = apply(data, draft('create', { title: 'Next week' })).data;
  assert.equal(next.rolls.length, 2); assert.deepEqual(next.rolls[0], data.rolls[0]);
});

test('reactions are separate per profile and malformed inputs cannot corrupt a roll', () => {
  let { data, id } = roll(); for (let i = 0; i < 24; i++) data = apply(data, shot(id)).data;
  data = apply(data, draft('develop', { rollId: id })).data;
  const reaction = draft('react', { rollId: id, shotId: data.rolls[0].shots[0].id, reaction: '♡' });
  data = apply(data, reaction).data; assert.equal(apply(data, reaction).changed, false);
  data = apply(data, { ...reaction, actor: 'youssef', reaction: '😂' }).data;
  assert.deepEqual(data.rolls[0].shots[0].reactions, { asnat: '♡', youssef: '😂' });
  for (const input of [draft('create', { title: '' }), draft('create', { title: 'a'.repeat(81) }), { ...shot(id), actor: 'stranger' }, { ...shot(id), photo: 'https://example.com/a.jpg' }, { ...shot(id), caption: 'x'.repeat(241) }, draft('capture', { rollId: '../private', caption: '', photo: jpeg }), { ...reaction, reaction: '<script>' }]) assert.throws(() => checkedCameraChange(input), e => e.status === 400);
  const broken = structuredClone(data); broken.rolls[0].shots.push(broken.rolls[0].shots[0]); assert.throws(() => checkedCamera(broken));
  const early = structuredClone(data); early.rolls[0].shots.pop(); assert.throws(() => checkedCamera(early));
});

test('GitHub commits metadata and private photo atomically and retries the last-slot race without overfilling', async () => {
  let { data, id } = roll(); for (let i = 0; i < 23; i++) data = apply(data, shot(id)).data;
  let head = '1'.repeat(40), tree = '2'.repeat(40), staged, race = true; const calls = [];
  const encryptionKey = cameraKey('test-only-camera-secret-1234567890123456789');
  const store = new GitHubCameraStore({ secret: () => 'test-only-camera-secret-1234567890123456789', token: () => 'test-token', fetcher: async (url, options) => {
    const path = new URL(url).pathname.split('/asechka-website')[1], body = options.body && JSON.parse(options.body); calls.push({ path, body }); let value;
    if (path === '/git/ref/heads/main') value = { object: { sha: head } };
    else if (path === '/contents/private/camera.json') value = { type: 'file', size: 1000, sha: '3'.repeat(40), encoding: 'base64', content: Buffer.from(JSON.stringify(storedCamera(data, encryptionKey))).toString('base64') };
    else if (path.startsWith('/git/commits/') && options.method === 'GET') value = { tree: { sha: tree } };
    else if (path === '/git/blobs') value = { sha: '4'.repeat(40) };
    else if (path === '/git/trees') { assert.equal(body.base_tree, tree); assert(body.tree.every(entry => entry.path === 'private/camera.json' || /^private\/camera\/[a-f0-9-]{36}\.bin$/.test(entry.path))); staged = JSON.parse(body.tree[0].content); value = { sha: '5'.repeat(40) }; }
    else if (path === '/git/commits') value = { sha: '6'.repeat(40) };
    else if (path === '/git/refs/heads/main') { assert.equal(body.force, false); if (race) { race = false; data = apply(data, { ...shot(id), actor: 'youssef' }).data; head = '7'.repeat(40); tree = '8'.repeat(40); return Response.json({}, { status: 422 }); } data = staged; value = {}; }
    else throw Error('Unexpected Git call ' + path);
    return Response.json(value);
  } });
  await assert.rejects(() => store.change(shot(id)), e => e.status === 409);
  assert.equal(data.rolls[0].shots.length, 24); assert.equal(data.rolls[0].shots.at(-1).actor, 'youssef');
  assert.equal(calls.filter(call => call.path === '/git/trees').length, 1);
  await assert.rejects(() => store.photo(data.rolls[0].shots[0].id), e => e.status === 404);
  await assert.rejects(() => store.photo('../camera.json'), e => e.status === 404);
});

test('API authenticates photos and metadata, protects writes and strips hidden data from all responses', async () => {
  process.env.SITE_PASSWORD = 'film-test'; process.env.SESSION_SECRET = randomBytes(48).toString('hex');
  let { data, id } = roll(); let photos = 0;
  const handler = createCameraAPI({ collection: { writable: true, read: async () => data, photo: async photoId => { photos++; if (!data.rolls.some(r => r.developedAt && r.shots.some(s => s.id === photoId))) { const { TogetherError } = await import('../server/together-store.js'); throw new TogetherError('Sealed', 404); } return Buffer.from([255,216,255,217]); }, change: async input => { data = apply(data, input).data; return data; } } });
  const origin = 'https://film.example';
  assert.equal((await handler(new Request(origin + '/api/camera', { headers: { accept: 'application/json' } }))).status, 401);
  assert.equal((await handler(new Request(origin + '/api/camera?photo=' + randomUUID(), { headers: { accept: 'application/json' } }))).status, 401); assert.equal(photos, 0);
  const login = await authorize(new Request(origin + '/api/session', { method: 'POST', headers: { origin, accept: 'application/json' }, body: new URLSearchParams({ password: 'film-test' }) })); const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { cookie, origin, accept: 'application/json', 'content-type': 'application/json', 'x-asechka-camera': '1' };
  const request = (body, extra = {}) => new Request(origin + '/api/camera', { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  for (const extra of [{ origin: 'https://evil.example' }, { origin: '' }, { 'x-asechka-camera': '' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await handler(request(shot(id), extra))).status, 403);
  const body = shot(id), saved = await handler(request(body)); assert.equal(saved.status, 200); assert.match(saved.headers.get('cache-control'), /no-store/); assert.equal((await saved.json()).rolls[0].shots[0].caption, undefined);
  assert.equal((await handler(new Request(origin + '/api/camera?photo=' + body.operationId, { headers }))).status, 404);
  assert.equal((await handler(new Request(origin + '/api/journal?__camera=1', { headers }))).status, 200);
  assert.equal((await handler(request({}))).status, 400);
  assert.equal((await handler(request(body, { 'content-length': '999999' }))).status, 413);
  for (let i = 1; i < 24; i++) data = apply(data, shot(id)).data;
  assert.equal((await handler(request(draft('develop', { rollId: id })))).status, 200);
  assert.equal((await handler(new Request(origin + '/api/camera?photo=' + body.operationId, { headers }))).status, 200);
});

test('public output never bundles sealed originals and stays inside the existing function budget', async () => {
  const { readdir } = await import('node:fs/promises'); const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)));
  assert(config.rewrites.some(rule => rule.source === '/api/camera' && rule.destination.includes('__camera=1')));
  assert((await readdir(new URL('../api', import.meta.url))).filter(file => file.endsWith('.js')).length + 1 <= 12);
  assert(!(await readdir(new URL('../dist', import.meta.url))).includes('camera.json'));
});
