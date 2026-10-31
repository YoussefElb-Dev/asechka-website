import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { authorize, sessionToken } from '../server/auth.js';
import { appendMemory, checkedMemoryChange, GitHubMemoriesStore } from '../server/memories-store.js';
import { TogetherError } from '../server/together-store.js';
import { createShakespeareAPI, checkedShakespearePost } from '../server/shakespeare-api.js';
import entry from '../api/shakespeare.js';

process.env.SITE_PASSWORD = 'test-only-site-code';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
const origin = 'https://asechka-website.vercel.app';
const key = () => createHash('sha256').update(process.env.SESSION_SECRET + '\0' + process.env.SITE_PASSWORD).digest();
const cookie = () => 'asechka_session=' + sessionToken(key());
const input = (extra = {}) => ({ operationId: randomUUID(), text: 'You feel like home.\nإنت راحة قلبي. ♡', date: '2026-10-31', language: 'arz', ...extra });
const request = (body, headers = {}, method = 'POST') => new Request(origin + '/api/shakespeare', {
  method, headers: { cookie: cookie(), origin, accept: 'application/json', 'content-type': 'application/json', 'x-asechka-shakespeare': '1', ...headers },
  ...(['GET', 'HEAD'].includes(method) ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});
function memoryStore() {
  let data = { version: 1, quotes: ['Keep the original'], photos: [] };
  let writes = 0;
  return { writable: true, get writes() { return writes; }, get data() { return data; },
    change: async value => {
      const update = appendMemory(data, checkedMemoryChange(value));
      if (update.changed) writes++;
      data = update.data; return data;
    },
  };
}

test('native login returns JSON without redirects and keeps errors JSON when requested', async () => {
  const loginRequest = (extra = {}) => new Request(origin + '/api/session', {
    method: 'POST', headers: { accept: 'application/json', origin, 'content-type': 'application/x-www-form-urlencoded', 'x-real-ip': 'shakespeare-login-tests' },
    body: new URLSearchParams({ password: process.env.SITE_PASSWORD }), ...extra,
  });
  const success = await authorize(loginRequest());
  assert.equal(success.status, 200); assert.equal(success.headers.get('location'), null);
  assert.deepEqual(await success.json(), { location: '/welcome' });
  assert.match(success.headers.get('set-cookie'), /^asechka_session=.+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure$/);
  for (const invalid of [
    new Request(origin + '/api/session', { headers: { accept: 'application/json' } }),
    loginRequest({ headers: { accept: 'application/json', origin: 'https://evil.example' } }),
    loginRequest({ body: 'a'.repeat(1025) }),
    loginRequest({ body: new ReadableStream({ start(controller) { controller.error(new Error('broken input')); } }), duplex: 'half' }),
  ]) {
    const result = await authorize(invalid);
    assert.ok([400, 403, 405, 413].includes(result.status));
    assert.ok((await result.json()).error); assert.equal(result.headers.get('set-cookie'), null);
  }
});

test('real auth is required before any storage operation; forged and expired sessions cannot publish', async () => {
  const collection = memoryStore(), handle = createShakespeareAPI({ collection });
  for (const value of ['', 'asechka_session=true', cookie().slice(0, -5) + 'badxx',
    'asechka_session=' + sessionToken(key(), Date.now() - 604801000)]) {
    const result = await handle(request(input(), { cookie: value }));
    assert.equal(result.status, 401); assert.ok((await result.json()).error);
    assert.match(result.headers.get('cache-control'), /no-store/);
  }
  assert.equal(collection.writes, 0);
});

test('signed-in requests still require same-origin JSON and an explicit app marker', async () => {
  const collection = memoryStore(), handle = createShakespeareAPI({ collection });
  for (const headers of [{ origin: '' }, { origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' },
    { 'x-asechka-shakespeare': '' }, { 'content-type': 'text/plain' }, { 'content-type': 'application/jsonp' }]) {
    assert.equal((await handle(request(input(), headers))).status, 403);
  }
  for (const method of ['GET', 'HEAD', 'DELETE', 'OPTIONS', 'PUT']) {
    const result = await handle(request(input(), {}, method));
    assert.equal(result.status, 405); assert.equal(result.headers.get('allow'), 'POST');
  }
  assert.equal(collection.writes, 0);
});

test('append-only validation rejects invalid dates, arbitrary actions, authors, paths and oversized quotes', async () => {
  const collection = memoryStore(), handle = createShakespeareAPI({ collection });
  for (const body of [null, [], {}, input({ text: '' }), input({ text: '   ' }), input({ text: 7 }),
    input({ text: 'a'.repeat(2401) }), input({ operationId: '../secret' }), input({ date: '2026-02-30' }),
    input({ date: '2026-13-01' }), input({ date: 2026 }), input({ language: 'unsupported' }),
    input({ language: ['en'] }), input({ action: 'removeQuote' }), input({ author: 'asnat' }),
    input({ path: 'server/auth.js' }), input({ note: 'Injected' }), 'not JSON']) {
    const result = await handle(request(body));
    assert.equal(result.status, 400, JSON.stringify(body)); assert.ok((await result.json()).error);
  }
  assert.equal(collection.writes, 0);
  for (const language of ['en', 'ar', 'arz', 'fr', 'ru', 'he', 'es', 'de', 'it', 'tr', 'ur', 'zh', undefined]) {
    assert.equal(checkedShakespearePost(input({ language })).action, 'addQuote');
  }
});

test('bounded streaming rejects oversized requests even with absent or dishonest Content-Length', async () => {
  const collection = memoryStore(), handle = createShakespeareAPI({ collection });
  for (const headers of [{ 'content-length': '16001' }, {}, { 'content-length': '1' }]) {
    const result = await handle(request(' '.repeat(16001), headers));
    assert.equal(result.status, 413);
  }
  const invalidUTF8 = new Request(origin + '/api/shakespeare', {
    method: 'POST', headers: request(input()).headers, body: new Uint8Array([0xff, 0xfe]),
  });
  assert.equal((await handle(invalidUTF8)).status, 400);
  assert.equal(collection.writes, 0);
});

test('successful post preserves Unicode and existing memories, with a narrow confirmed response', async () => {
  const collection = memoryStore(), handle = createShakespeareAPI({ collection }), body = input();
  const result = await handle(request(body));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { id: body.operationId, posted: true, url: origin + '/quotes.html' });
  assert.deepEqual(collection.data.quotes[0], 'Keep the original');
  const post = collection.data.quotes[1];
  assert.equal(post.text, body.text); assert.equal(post.date, body.date);
  assert.equal(post.author, 'youssef'); assert.equal(post.note, 'Created with Shakespeare');
  assert.equal(post.id, body.operationId); assert.ok(post.createdAt);
  assert.equal(result.headers.get('access-control-allow-origin'), null);
  assert.equal(typeof entry.fetch, 'function');
});

test('retry after a lost response writes once, while changed payloads fail with 409', async () => {
  const collection = memoryStore(), handle = createShakespeareAPI({ collection }), body = input();
  assert.equal((await handle(request(body))).status, 200);
  assert.equal((await handle(request(body))).status, 200);
  for (const extra of [{ text: 'Changed after send' }, { date: '2026-11-01' }]) {
    assert.equal((await handle(request({ ...body, ...extra }))).status, 409);
  }
  assert.equal(collection.writes, 1); assert.equal(collection.data.quotes.length, 2);
});

test('missing configuration fails closed and never reports unavailable or unconfirmed writes as posted', async () => {
  const body = input();
  for (const collection of [
    { writable: false, change: () => assert.fail('No write when disabled') },
    { writable: true, change: async () => { throw new Error('secret-token-must-never-leak'); } },
    { writable: true, change: async () => ({ quotes: [] }) },
    { writable: true, change: async () => ({ quotes: [{ id: body.operationId, text: 'wrong' }] }) },
  ]) {
    const result = await createShakespeareAPI({ collection })(request(body));
    assert.equal(result.status, 503);
    const value = await result.json(); assert.ok(value.error); assert.equal(value.posted, undefined);
    assert.ok(!JSON.stringify(value).includes('secret-token'));
  }
  const handle = createShakespeareAPI({ collection: memoryStore() }), validRequest = request(body);
  const savedSecret = process.env.SESSION_SECRET;
  try {
    delete process.env.SESSION_SECRET;
    const result = await handle(validRequest);
    assert.equal(result.status, 503); assert.ok((await result.json()).error);
  } finally { process.env.SESSION_SECRET = savedSecret; }
});

test('changing the existing site code revokes the same publishing session', async () => {
  const collection = memoryStore(), handle = createShakespeareAPI({ collection }), previousRequest = request(input());
  const saved = process.env.SITE_PASSWORD;
  try {
    process.env.SITE_PASSWORD = 'new-site-code';
    assert.equal((await handle(previousRequest)).status, 401); assert.equal(collection.writes, 0);
  } finally { process.env.SITE_PASSWORD = saved; }
});

test('canonical GitHub commit retries preserve simultaneous posts and deduplicate a received operation', async () => {
  let data = { version: 1, quotes: [], photos: [], unrelated: 'preserved' };
  let head = '1'.repeat(40), tree = '2'.repeat(40), pending, collide = true, commits = 0;
  const fetcher = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer server-only-test-token');
    const path = new URL(url).pathname.split('/asechka-website')[1];
    const body = options.body ? JSON.parse(options.body) : undefined;
    if (path === '/git/ref/heads/main') return Response.json({ object: { sha: head } });
    if (path === '/contents/dist/memories.json') return Response.json({ type: 'file', size: 100, sha: '3'.repeat(40),
      encoding: 'base64', content: Buffer.from(JSON.stringify(data)).toString('base64') });
    if (path.startsWith('/git/commits/') && options.method === 'GET') return Response.json({ tree: { sha: tree } });
    if (path === '/git/trees') {
      assert.equal(body.base_tree, tree); assert.equal(body.tree.length, 1);
      assert.equal(body.tree[0].path, 'dist/memories.json');
      pending = JSON.parse(body.tree[0].content); return Response.json({ sha: '4'.repeat(40) });
    }
    if (path === '/git/commits') {
      assert.deepEqual(body.parents, [head]); return Response.json({ sha: '5'.repeat(40) });
    }
    if (path === '/git/refs/heads/main') {
      assert.equal(body.force, false);
      if (collide) {
        collide = false; head = '6'.repeat(40); tree = '7'.repeat(40);
        data.quotes.push({ id: randomUUID(), text: 'A simultaneous Asechka post' });
        return Response.json({}, { status: 422 });
      }
      data = pending; head = body.sha; commits++; return Response.json({ object: { sha: head } });
    }
    throw new TogetherError('Unexpected GitHub endpoint');
  };
  const collection = new GitHubMemoriesStore({ token: () => 'server-only-test-token', fetcher });
  const handle = createShakespeareAPI({ collection }), body = input();
  assert.equal((await handle(request(body))).status, 200);
  assert.equal((await handle(request(body))).status, 200);
  assert.equal(data.quotes.length, 2); assert.equal(data.quotes[0].text, 'A simultaneous Asechka post');
  assert.equal(data.quotes[1].text, body.text); assert.equal(data.unrelated, 'preserved'); assert.equal(commits, 1);
});
