import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { Publisher, execute, mergeContent, checkedContent, atomicJson, validDate } from '../publisher/core.mjs';
import { imageTask } from '../publisher/studio.mjs';

const empty = () => ({ version: 1, updatedAt: null, quotes: [], photos: [] });
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'asechka-test-'));
  t.after(async () => {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected cleanup path');
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}
async function git(directory, ...args) {
  return (await execute('git', args, { cwd: directory, windowsHide: true, timeout: 30000 })).stdout.trim();
}
async function repository(t) {
  const directory = await temporary(t);
  const remote = join(directory, 'remote.git');
  const seed = join(directory, 'seed');
  await git(directory, 'init', '--bare', '--initial-branch=main', remote);
  await mkdir(seed);
  await git(seed, 'init', '--initial-branch=main');
  await git(seed, 'config', 'user.name', 'Publisher test');
  await git(seed, 'config', 'user.email', 'publisher@example.test');
  await atomicJson(join(seed, 'dist', 'memories.json'), { ...empty(), quotes: [{ id: 'original', text: 'An existing memory' }] });
  await git(seed, 'add', '.');
  await git(seed, 'commit', '-m', 'Test fixture');
  await git(seed, 'remote', 'add', 'origin', remote);
  await git(seed, 'push', 'origin', 'main');
  return { directory, remote, seed };
}
async function saved(remote) {
  return JSON.parse(await git(remote, 'show', 'main:dist/memories.json'));
}

test('merge preserves old memories and literal text; entry IDs make retries idempotent', () => {
  const entry = { id: randomUUID(), kind: 'quote', text: '"You" <script> & Russian: Асечка\nSecond line', date: '2026-10-12', note: 'a note' };
  const base = { ...empty(), custom: 'keep me', quotes: ['Old quote'] };
  const first = mergeContent(base, [entry]);
  assert.equal(first.added, 1);
  assert.deepEqual(first.content.quotes[0], 'Old quote');
  assert.equal(first.content.quotes[1].text, entry.text);
  assert.equal(first.content.custom, 'keep me');
  assert.equal(mergeContent(first.content, [entry]).added, 0);
  assert.equal(base.quotes.length, 1);
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.throws(() => checkedContent({ ...empty(), photos: [{}] }));
});

test('offline drafts survive restarting the app and a failed connection', async t => {
  const directory = await temporary(t);
  const settings = { directory: join(directory, 'studio'), remote: join(directory, 'missing.git') };
  const publisher = new Publisher(settings);
  await publisher.initialize();
  const entry = await publisher.addQuote({ text: 'A saved offline quote', date: '2026-10-12' });
  await assert.rejects(publisher.publish());
  const restarted = new Publisher(settings);
  await restarted.initialize();
  assert.equal((await restarted.readQueue()).pending[0].id, entry.id);
  await assert.rejects(restarted.addQuote({ text: ' ', date: '2026-10-12' }));
  await assert.rejects(restarted.addQuote({ text: 'A quote', date: '2026-02-30' }));
  assert.equal((await restarted.readQueue()).pending.length, 1);
});

test('quotes and photos publish atomically in one commit; a lost push response never duplicates them', async t => {
  const fixture = await repository(t);
  class DroppedResponsePublisher extends Publisher {
    drop = true;
    async runGit(args, cwd) {
      const result = await super.runGit(args, cwd);
      if (args[0] === 'push' && this.drop) { this.drop = false; throw new Error('Connection dropped after the push arrived'); }
      return result;
    }
  }
  const publisher = new DroppedResponsePublisher({ directory: join(fixture.directory, 'studio'), remote: fixture.remote });
  await publisher.initialize();
  const quote = await publisher.addQuote({ text: 'First new quote', date: '2026-10-12' });
  const photo = await publisher.addPhoto({ jpegPath: new URL('../dist/assets/cats-cuddle.jpg', import.meta.url), caption: 'Test picture', date: '2026-10-12' });
  const result = await publisher.publish();
  assert.equal(result.count, 2);
  const content = await saved(fixture.remote);
  assert.deepEqual(content.quotes.map(q => q.id), ['original', quote.id]);
  assert.equal(content.photos[0].id, photo.id);
  assert.equal(content.photos[0].localPath, undefined);
  assert.equal(await git(fixture.remote, 'rev-list', '--count', 'main'), '2');
  assert.match(await git(fixture.remote, 'ls-tree', '-r', '--name-only', 'main'), new RegExp(photo.id));
  assert.equal((await publisher.readQueue()).pending.length, 0);
  assert.equal((await publisher.publish()).count, 0);
});

test('a concurrent GitHub edit is kept when the publisher retries its rejected push', async t => {
  const fixture = await repository(t);
  class ConcurrentPublisher extends Publisher {
    collide = true;
    async runGit(args, cwd) {
      if (args[0] === 'push' && this.collide) {
        this.collide = false;
        const content = await saved(fixture.remote);
        content.quotes.push({ id: 'other-editor', text: 'Added on GitHub while publishing' });
        await atomicJson(join(fixture.seed, 'dist', 'memories.json'), content);
        await git(fixture.seed, 'add', '.');
        await git(fixture.seed, 'commit', '-m', 'Concurrent editor');
        await git(fixture.seed, 'push', 'origin', 'main');
      }
      return super.runGit(args, cwd);
    }
  }
  const publisher = new ConcurrentPublisher({ directory: join(fixture.directory, 'studio'), remote: fixture.remote });
  await publisher.initialize();
  const entry = await publisher.addQuote({ text: 'Added from the terminal', date: '2026-10-12' });
  await publisher.publish();
  assert.deepEqual((await saved(fixture.remote)).quotes.map(q => q.id), ['original', 'other-editor', entry.id]);
});

test('invalid remote content leaves both GitHub and the pending queue untouched', async t => {
  const fixture = await repository(t);
  await writeFile(join(fixture.seed, 'dist', 'memories.json'), 'invalid JSON');
  await git(fixture.seed, 'add', '.');
  await git(fixture.seed, 'commit', '-m', 'Invalid test content');
  await git(fixture.seed, 'push', 'origin', 'main');
  const publisher = new Publisher({ directory: join(fixture.directory, 'studio'), remote: fixture.remote });
  await publisher.initialize();
  await publisher.addQuote({ text: 'Do not lose me', date: '2026-10-12' });
  await assert.rejects(publisher.publish());
  assert.equal((await publisher.readQueue()).pending.length, 1);
  assert.equal(await git(fixture.remote, 'show', 'main:dist/memories.json'), 'invalid JSON');
});

test('only one Studio instance can edit the queue', async t => {
  const directory = await temporary(t);
  const publisher = new Publisher({ directory });
  await publisher.initialize();
  const release = await publisher.lock();
  await assert.rejects(publisher.lock(), /already open/);
  await release();
  const releaseAgain = await publisher.lock();
  await releaseAgain();
});

test('Windows photo preparation preserves the original and produces a small correctly sized JPEG', { skip: process.platform !== 'win32' }, async t => {
  const directory = await temporary(t);
  const source = join(directory, "test '; & picture.png");
  const destination = join(directory, 'prepared.jpg');
  const script = 'Add-Type -AssemblyName System.Drawing;$b=New-Object System.Drawing.Bitmap(3600,1800);try{$g=[System.Drawing.Graphics]::FromImage($b);$g.Clear([System.Drawing.Color]::CornflowerBlue);$g.Dispose();$b.Save($env:ASECHKA_TEST_IMAGE,[System.Drawing.Imaging.ImageFormat]::Png)}finally{$b.Dispose()}';
  await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, ASECHKA_TEST_IMAGE: source }, windowsHide: true, timeout: 30000 });
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const before = hash(await readFile(source));
  const result = await imageTask({ mode: 'resize', source, destination }, directory);
  assert.equal(result.width, 1800);
  assert.equal(result.height, 900);
  assert.ok(result.bytes <= 1024 * 1024);
  assert.equal((await readFile(destination))[0], 0xff);
  assert.equal(hash(await readFile(source)), before);
});
