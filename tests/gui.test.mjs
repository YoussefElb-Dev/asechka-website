import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { Publisher, execute, atomicJson } from '../publisher/core.mjs';
import { createStudioApp } from '../publisher/gui.mjs';
import { request } from 'node:http';

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'asechka-gui-test-'));
  t.after(async () => {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected cleanup path');
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}
async function git(cwd, ...args) {
  return (await execute('git', args, { cwd, windowsHide: true, timeout: 30000 })).stdout.trim();
}
async function running(t, studio) {
  const app = await createStudioApp({ studio, prepareKey: false });
  const { origin, launchUrl } = await app.start(0);
  t.after(() => app.stop());
  const entry = await fetch(launchUrl, { redirect: 'manual' });
  assert.equal(entry.status, 303);
  const cookie = entry.headers.get('set-cookie').split(';')[0];
  assert.match(entry.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const get = path => fetch(origin + path, { headers: { Cookie: cookie } });
  const post = (path, data, extras = {}) => fetch(origin + path, {
    method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Asechka-Studio': '1', ...extras }, body: JSON.stringify(data),
  });
  return { app, origin, get, post, cookie };
}

test('the GUI protects local data, and quote/photo buttons publish the real album to a test repository', { skip: process.platform !== 'win32' }, async t => {
  const directory = await temporary(t);
  const remote = join(directory, 'remote.git');
  const seed = join(directory, 'seed');
  await git(directory, 'init', '--bare', '--initial-branch=main', remote);
  await mkdir(seed);
  await git(seed, 'init', '--initial-branch=main');
  await git(seed, 'config', 'user.name', 'GUI test');
  await git(seed, 'config', 'user.email', 'gui@example.test');
  await atomicJson(join(seed, 'dist', 'memories.json'), { version: 1, quotes: [], photos: [] });
  await git(seed, 'add', '.'); await git(seed, 'commit', '-m', 'Test album');
  await git(seed, 'remote', 'add', 'origin', remote); await git(seed, 'push', 'origin', 'main');
  const studio = new Publisher({ directory: join(directory, 'studio'), remote });
  const { origin, get, post, app } = await running(t, studio);
  for (const path of ['/', '/gui.js', '/api/status', '/api/photo/saved/0']) assert.equal((await fetch(origin + path)).status, 401);
  assert.equal((await fetch(origin + '/?launch=' + 'ж'.repeat(43))).status, 401);
  const forgedHost = await new Promise((resolve, reject) => {
    const req = request(origin + '/api/status', { headers: { Authorization: `Bearer ${app.token}`, Host: 'attacker.invalid' } }, response => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(forgedHost, 403);
  assert.equal((await post('/api/quote', { text: 'blocked', date: '2026-10-12', note: '' }, { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await post('/api/quote', { text: '', date: '2026-10-12', note: '' })).status, 400);
  const html = await (await get('/')).text();
  assert.match(html, /Save & publish quote/);
  const quote = 'Literal <script>alert(1)</script> & Асечка\nA second line';
  const quoteResult = await (await post('/api/quote', { text: quote, date: '2026-10-12', note: 'a note' })).json();
  assert.equal(quoteResult.saved, true); assert.equal(quoteResult.published, true);
  const photo = (await readFile(new URL('../dist/assets/cats-cuddle.jpg', import.meta.url))).toString('base64');
  const photoResult = await (await post('/api/photos', { photos: [{ data: photo, caption: 'Test picture', date: '2026-10-12' }] })).json();
  assert.equal(photoResult.saved, true); assert.equal(photoResult.published, true); assert.deepEqual(photoResult.savedIndices, [0]);
  const saved = JSON.parse(await git(remote, 'show', 'main:dist/memories.json'));
  assert.equal(saved.quotes[0].text, quote); assert.equal(saved.photos.length, 1);
  assert.equal(saved.photos[0].localPath, undefined);
  const status = await (await get('/api/status')).json();
  assert.equal(status.pending, 0); assert.equal(status.savedQuotes, 1); assert.equal(status.savedPhotos, 1);
  assert.equal(status.photos[0].localPath, undefined);
  const image = await get(status.photos[0].preview);
  assert.equal(image.status, 200); assert.equal(new Uint8Array(await image.arrayBuffer())[0], 0xff);
});

test('an offline GUI save survives failure and overlapping clicks cannot overwrite the queue', async t => {
  const directory = await temporary(t);
  let unblock;
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const waiting = new Promise(resolve => { unblock = resolve; });
  class OfflinePublisher extends Publisher {
    async addQuote(data) { began(); await waiting; return super.addQuote(data); }
    async publish() { throw new Error('Network is unreachable'); }
  }
  const studio = new OfflinePublisher({ directory });
  const { get, post } = await running(t, studio);
  const first = post('/api/quote', { text: 'Keep this offline quote', date: '2026-10-12', note: '' });
  await started;
  assert.equal((await post('/api/quote', { text: 'Overlapping click', date: '2026-10-12', note: '' })).status, 409);
  unblock();
  const saved = await (await first).json();
  assert.equal(saved.saved, true); assert.equal(saved.published, false);
  assert.equal(JSON.parse(await readFile(join(directory, 'gui-error.json'), 'utf8')).message, 'Network is unreachable');
  const view = await (await get('/api/status')).json();
  assert.equal(view.pending, 1); assert.equal(view.quotes[0].text, 'Keep this offline quote');
  assert.equal((await new Publisher({ directory }).readQueue()).pending.length, 1);
});

test('the GUI waits for an existing terminal and takes over after it closes', async t => {
  const directory = await temporary(t);
  const terminal = new Publisher({ directory });
  await terminal.initialize();
  const closeTerminal = await terminal.lock();
  const { get, post } = await running(t, new Publisher({ directory }));
  assert.equal((await (await get('/api/status')).json()).writable, false);
  assert.equal((await post('/api/quote', { text: 'Wait for terminal', date: '2026-10-12', note: '' })).status, 409);
  await closeTerminal();
  assert.equal((await (await get('/api/status')).json()).writable, true);
});
