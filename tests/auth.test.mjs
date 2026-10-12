import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { authorize, sessionToken, validSession } from '../server/auth.js';
import middleware from '../middleware.js';

process.env.SITE_PASSWORD = 'test-only-code';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
const base = 'https://asechka.example';
const request = (path, options = {}) => new Request(base + path, options);
const login = (password, headers = {}) => request('/api/session', {
  method: 'POST', headers: { origin: base, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', ...headers },
  body: new URLSearchParams({ password }),
});

test('every private path is gated, including images, source files and HEAD requests', async () => {
  for (const path of ['/', '/index.html', '/memories.js', '/assets/photos/us.jpg', '/assets/cats-cuddle.jpg', '/welcome', '/styles.css', '/app.js', '/assets/our-little-universe.png']) {
    const denied = await authorize(request(path));
    assert.equal(denied.status, 303, path);
    assert.equal(denied.headers.get('location'), '/login', path);
    assert.match(denied.headers.get('cache-control'), /no-store/);
  }
  assert.equal((await authorize(request('/index.html', { method: 'HEAD' }))).status, 303);
  assert.equal(await authorize(request('/gate.css')), null);
  const page = await (await authorize(request('/login'))).text();
  assert.ok(!page.includes(process.env.SITE_PASSWORD));
  assert.ok(!page.includes('My favorite thought'));
});

test('wrong passwords and cross-origin submissions never create a session', async () => {
  const wrong = await authorize(login('wrong-code'));
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('set-cookie'), null);
  assert.equal((await authorize(login(process.env.SITE_PASSWORD, { origin: 'https://other.example' }))).status, 403);
  assert.equal((await authorize(request('/api/session'))).status, 405);
});

test('correct password grants a signed secure cookie, greeting and private assets', async () => {
  const accepted = await authorize(login(process.env.SITE_PASSWORD));
  assert.equal(accepted.status, 200);
  const setCookie = accepted.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly; SameSite=Strict; Max-Age=604800; Secure/);
  assert.ok(!setCookie.includes(process.env.SITE_PASSWORD));
  const cookie = setCookie.split(';')[0];
  for (const path of ['/', '/memories.js', '/assets/photos/us.jpg']) assert.equal(await authorize(request(path, { headers: { cookie } })), null);
  const welcome = await (await authorize(request('/welcome', { headers: { cookie } }))).text();
  assert.match(welcome, /Welcome back/);
  assert.match(welcome, /моя радость/);
  assert.match(welcome, /С возвращением, Асечка/);
  const signedOut = await authorize(request('/api/logout', { method: 'POST', headers: { origin: base, cookie } }));
  assert.match(signedOut.headers.get('set-cookie'), /Max-Age=0/);
  const tampered = cookie.slice(0, -5) + 'abcde';
  assert.equal((await authorize(request('/', { headers: { cookie: tampered } }))).status, 303);
  const previous = process.env.SITE_PASSWORD;
  process.env.SITE_PASSWORD = 'a-changed-code';
  assert.equal((await authorize(request('/', { headers: { cookie } }))).status, 303);
  process.env.SITE_PASSWORD = previous;
});

test('expired, forged and malformed sessions are rejected', () => {
  const key = randomBytes(32);
  const now = Date.now();
  const token = sessionToken(key, now);
  assert.equal(validSession('asechka_session=' + token, key, now), true);
  assert.equal(validSession('asechka_session=' + token, key, now + 604800_000), false);
  assert.equal(validSession('asechka_session=' + token, randomBytes(32), now), false);
  for (const token of ['true', '2505', '%broken', 'undefined']) assert.equal(validSession('asechka_session=' + token, key), false);
});

test('missing server secrets fails closed and static continuation prevents caching', async () => {
  const saved = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  assert.equal((await authorize(request('/'))).status, 503);
  assert.equal((await authorize(login(process.env.SITE_PASSWORD))).status, 503);
  process.env.SESSION_SECRET = saved;
  const response = await middleware(request('/gate.css'));
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(response.headers.get('x-middleware-next'), '1');
});

test('repeated password guesses are throttled', async () => {
  for (let count = 0; count < 10; count++) {
    const response = await authorize(login(process.env.SITE_PASSWORD, { 'x-real-ip': 'test-throttle' }));
    assert.equal(response.status, 200);
  }
  assert.equal((await authorize(login(process.env.SITE_PASSWORD, { 'x-real-ip': 'test-throttle' }))).status, 429);
});
