import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as server from '../server/memories-store.js';
import * as mirror from '../mobile/android/tools/backend/memories-store.js';
import { contentFingerprint } from '../server/memory-social.js';
import { createMemoriesAPI } from '../server/memories-api.js';
import { createMemoriesAPI as createMirrorAPI } from '../mobile/android/tools/backend/memories-api.js';
import { authorize } from '../server/auth.js';

const jpeg = 'data:image/jpeg;base64,' + (await readFile(new URL('../dist/assets/cats-cuddle.jpg', import.meta.url))).toString('base64');
const date = '2026-10-31';
const copy = value => structuredClone(value);
const empty = () => ({ version: 1, quotes: [], photos: [] });
const add = (extra = {}) => ({ action: 'addPhoto', operationId: randomUUID(), date, caption: 'Afternoon light', photo: jpeg, ...extra });
const conflict = error => error.status === 409;
const invalid = error => error.status === 400;
function legacy() {
  const id = randomUUID();
  return {
    version: 1, quotes: ['An older thought'], extra: { keep: true },
    photos: [{ id, src: `assets/photos/2026/10/${id}.jpg`, caption: 'Our first day', date,
      alt: 'An old picture of us', extra: 'keep this', createdAt: '2026-10-12T16:00:00.000Z' }],
  };
}

for (const [name, rules] of [['server', server], ['local backend mirror', mirror]]) {
  const apply = (data, input) => rules.appendMemory(data, rules.checkedMemoryChange(input), new Date('2026-10-31T16:00:00Z'));
  const edit = (data, extra = {}, index = 0) => {
    const item = rules.editableMemories(data).photos[index];
    return { action: 'updatePhoto', operationId: randomUUID(), id: item.editKey, expectedVersion: item.editVersion,
      date: item.date || date, caption: item.caption || '', ...extra };
  };

  test(`${name}: new uploads choose either collection; old uploads default to memories without changing old photos`, () => {
    const initial = legacy();
    const original = copy(initial);
    for (const collection of [undefined, 'memories', 'photography']) {
      const input = add(collection === undefined ? {} : { collection });
      const result = apply(initial, input);
      assert.equal(result.item.collection, collection ?? 'memories');
      assert.equal(result.item.id, input.operationId);
      assert.deepEqual(result.data.photos[0], original.photos[0]);
      assert.deepEqual(result.data.quotes, original.quotes);
      assert.deepEqual(result.data.extra, original.extra);
      assert.deepEqual(initial, original);
      assert.deepEqual(JSON.parse(JSON.stringify(result.data)), result.data);
    }
  });

  test(`${name}: invalid categories and every quote category payload are rejected`, () => {
    const data = legacy();
    for (const collection of ['', 'Photography', 'other', null, false, 0, [], {}]) {
      assert.throws(() => rules.checkedMemoryChange(add({ collection })), invalid);
      assert.throws(() => rules.checkedMemoryChange(edit(data, { collection })), invalid);
    }
    for (const action of ['addQuote', 'updateQuote', 'removeQuote']) {
      assert.throws(() => rules.checkedMemoryChange({ action, operationId: randomUUID(), collection: 'photography',
        id: randomUUID(), expectedVersion: 'a'.repeat(64), text: 'Us', date }), invalid);
    }
    assert.throws(() => rules.checkedMemoryChange({ action: 'setLike', operationId: randomUUID(), id: randomUUID(),
      kind: 'quote', actor: 'asnat', liked: true, collection: 'photography' }), invalid);
    for (const collection of [null, 'unknown']) {
      const malformed = legacy(); malformed.photos[0].collection = collection;
      assert.throws(() => rules.checkedMemories(malformed));
    }
  });

  test(`${name}: omitted collection on caption/date edits preserves explicit and legacy categories`, () => {
    for (const collection of [undefined, 'memories', 'photography']) {
      const data = legacy();
      if (collection !== undefined) data.photos[0].collection = collection;
      const original = copy(data);
      const result = apply(data, edit(data, { caption: 'A new caption', date: '2026-11-01' }));
      assert.equal(result.item.caption, 'A new caption');
      assert.equal(result.item.date, '2026-11-01');
      assert.equal(result.item.collection, collection);
      assert.equal(Object.hasOwn(result.item, 'collection'), collection !== undefined);
      assert.equal(result.item.src, original.photos[0].src);
      assert.equal(result.item.createdAt, original.photos[0].createdAt);
      assert.equal(result.item.extra, 'keep this');
      assert.deepEqual(data, original);
      assert.equal(result.removedPhoto, undefined);
    }
  });

  test(`${name}: an old client's image replacement also preserves Photography`, () => {
    const data = legacy(); data.photos[0].collection = 'photography';
    const result = apply(data, edit(data, { photo: jpeg, caption: 'Another angle' }));
    assert.equal(result.item.collection, 'photography');
    assert.notEqual(result.item.src, data.photos[0].src);
    assert.equal(result.removedPhoto, data.photos[0].src);
    assert.equal(result.item.id, data.photos[0].id);
  });

  test(`${name}: explicit moves work in both directions and keep image, author and conversation`, () => {
    let data = apply(empty(), add({ author: 'asnat', collection: 'memories' })).data;
    data.photos[0].social = { likes: { asnat: true, youssef: true }, comments: [{ id: randomUUID(), text: 'Love this', author: 'youssef' }], receipts: [] };
    const original = copy(data.photos[0]);
    const stale = edit(data, { caption: 'A stale caption' });
    for (const collection of ['photography', 'memories']) {
      const before = rules.editableMemories(data).photos[0];
      const result = apply(data, edit(data, { collection }));
      data = result.data;
      assert.equal(result.item.collection, collection);
      for (const field of ['id', 'src', 'contentHash', 'createdAt', 'author', 'caption']) assert.equal(result.item[field], original[field]);
      assert.deepEqual(result.item.social, original.social);
      assert.notEqual(rules.editableMemories(data).photos[0].editVersion, before.editVersion);
      assert.equal(result.removedPhoto, undefined);
    }
    assert.throws(() => apply(data, stale), conflict);
    assert.throws(() => apply(data, { ...stale, action: 'removePhoto' }), conflict);
  });

  test(`${name}: photo creation retries are idempotent and changed collection conflicts with the same ID`, () => {
    for (const collection of [undefined, 'memories', 'photography']) {
      const input = add(collection === undefined ? {} : { collection });
      const first = apply(empty(), input);
      const snapshot = copy(first.data);
      assert.equal(apply(first.data, input).changed, false);
      assert.deepEqual(first.data, snapshot);
      assert.throws(() => apply(first.data, { ...input, collection: (collection ?? 'memories') === 'photography' ? 'memories' : 'photography' }), conflict);
      if (collection !== 'photography') assert.equal(apply(first.data, { ...input, collection: 'memories' }).changed, false);
    }
  });

  test(`${name}: photo edit retries retain category intent, including omitted versus explicit moves`, () => {
    const data = apply(empty(), add({ collection: 'photography' })).data;
    for (const extra of [{ caption: 'Old client caption' }, { caption: 'Moved', collection: 'memories' }]) {
      const input = edit(data, extra);
      const first = apply(data, input);
      assert.equal(apply(first.data, copy(input)).changed, false);
      for (const collection of ['photography', 'memories']) {
        if (collection === input.collection) continue;
        assert.throws(() => apply(first.data, { ...input, collection }), conflict);
      }
      if (input.collection !== undefined) {
        const omitted = { ...input }; delete omitted.collection;
        assert.throws(() => apply(first.data, omitted), conflict);
      }
      const fresh = edit(first.data, { caption: 'Fresh old client caption' });
      const changed = apply(first.data, fresh);
      assert.equal(changed.item.collection, first.item.collection);
    }
  });

  test(`${name}: old client stale edits cannot silently undo a category move`, () => {
    const data = legacy();
    const oldClient = edit(data, { caption: 'From the older phone' });
    const moved = apply(data, edit(data, { collection: 'photography' })).data;
    assert.throws(() => apply(moved, oldClient), conflict);
    assert.equal(moved.photos[0].collection, 'photography');
    const fresh = apply(moved, edit(moved, { caption: 'After syncing' }));
    assert.equal(fresh.item.collection, 'photography');
  });

  test(`${name}: likes, comments and edit versions survive category changes`, () => {
    let data = apply(empty(), add({ collection: 'photography' })).data;
    const editBeforeLike = edit(data, { collection: 'memories' });
    const post = { operationId: randomUUID(), action: 'setLike', id: data.photos[0].id, kind: 'photo', actor: 'asnat', liked: true };
    data = apply(data, post).data;
    assert.equal(rules.editableMemories(data).photos[0].editVersion, editBeforeLike.expectedVersion);
    data = apply(data, editBeforeLike).data;
    const comment = { operationId: randomUUID(), action: 'addComment', id: data.photos[0].id, kind: 'photo', actor: 'youssef', text: 'Little things ♡ بحبك' };
    data = apply(data, comment).data;
    assert.equal(data.photos[0].collection, 'memories');
    assert.equal(data.photos[0].social.likes.asnat, true);
    assert.equal(data.photos[0].social.comments[0].text, comment.text);
    assert.equal(apply(data, post).changed, false);
    assert.equal(apply(data, comment).changed, false);
    assert.equal(apply(data, editBeforeLike).changed, false);
  });

  test(`${name}: reads retain categories without migrating uncategorized photos`, () => {
    const data = legacy();
    const original = copy(data.photos[0]);
    const added = apply(data, add({ collection: 'photography' })).data;
    const visible = rules.editableMemories(added);
    assert.equal(visible.photos[1].collection, 'photography');
    assert.equal(Object.hasOwn(visible.photos[0], 'collection'), false);
    assert.equal(Object.hasOwn(added.photos[0], 'editVersion'), false);
    assert.deepEqual(added.photos[0], original);
    const { social, ...content } = original;
    assert.equal(visible.photos[0].editVersion, createHash('sha256').update(JSON.stringify(content)).digest('hex'));
    visible.photos[1].collection = 'memories';
    assert.equal(added.photos[1].collection, 'photography');
  });

  test(`${name}: removing one collection's picture preserves the other collection and shared image references`, () => {
    const data = apply(apply(empty(), add({ collection: 'memories' })).data, add({ collection: 'photography' })).data;
    data.photos[1].src = data.photos[0].src;
    const original = copy(data.photos[0]);
    const result = apply(data, edit(data, { action: 'removePhoto' }, 1));
    assert.deepEqual(result.data.photos, [original]);
    assert.equal(result.removedPhoto, undefined);
  });
}

test('collection is part of contentFingerprint, while conversation-only changes are excluded', () => {
  const original = { id: randomUUID(), src: 'assets/photos/sunlight.jpg', collection: 'memories' };
  assert.notEqual(contentFingerprint(original), contentFingerprint({ ...original, collection: 'photography' }));
  assert.equal(contentFingerprint(original), contentFingerprint({ ...original, social: { likes: { asnat: true }, comments: [] } }));
});

test('authenticated API reads and older-client edits retain Photography in server and mirrored handlers', async t => {
  const previous = { password: process.env.SITE_PASSWORD, secret: process.env.SESSION_SECRET };
  process.env.SITE_PASSWORD = 'photography-fixture-only'; process.env.SESSION_SECRET = 'photography-fixture-secret-'.repeat(3);
  t.after(() => {
    for (const [key, value] of [['SITE_PASSWORD', previous.password], ['SESSION_SECRET', previous.secret]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const origin = 'https://photography.example';
  const login = await authorize(new Request(origin + '/api/session', { method: 'POST', headers: { origin, accept: 'application/json' }, body: new URLSearchParams({ password: process.env.SITE_PASSWORD }) }));
  const cookie = login.headers.get('set-cookie').split(';')[0];
  for (const [createAPI, rules] of [[createMemoriesAPI, server], [createMirrorAPI, mirror]]) {
    let data = legacy();
    const handler = createAPI({ collection: { writable: true, read: async () => data, change: async input => {
      data = rules.appendMemory(data, rules.checkedMemoryChange(input)).data; return data;
    } } });
    const headers = { cookie, origin, accept: 'application/json', 'content-type': 'application/json', 'x-asechka-memories': '1' };
    const request = async input => handler(new Request(origin + '/api/memories', { method: input ? 'POST' : 'GET', headers, ...(input ? { body: JSON.stringify(input) } : {}) }));
    const added = await request(add({ collection: 'photography' }));
    assert.equal(added.status, 200);
    let result = await added.json();
    assert.equal(result.photos[1].collection, 'photography');
    const item = result.photos[1];
    const oldEdit = { action: 'updatePhoto', operationId: randomUUID(), id: item.editKey, expectedVersion: item.editVersion, date, caption: 'An older phone caption' };
    const updated = await request(oldEdit);
    assert.equal(updated.status, 200);
    result = await updated.json();
    assert.equal(result.photos[1].collection, 'photography');
    const read = await request();
    assert.equal(read.status, 200);
    result = await read.json();
    assert.equal(result.photos[1].collection, 'photography');
    assert.equal(Object.hasOwn(result.photos[0], 'collection'), false);
    assert.equal(result.features.social, true);
    assert.equal(result.features.editPosts, true);
    const invalidQuote = await request({ action: 'addQuote', operationId: randomUUID(), date, text: 'A quote', collection: 'photography' });
    assert.equal(invalidQuote.status, 400);
    assert.equal(data.quotes.length, 1);
  }
});

test('a GitHub category move writes metadata only and retains every photo file', async () => {
  let data = legacy();
  const original = copy(data.photos[0]);
  const calls = [];
  const sha = character => character.repeat(40);
  let pending;
  const store = new server.GitHubMemoriesStore({ token: () => 'fixture-only-token', fetcher: async (url, options) => {
    const path = new URL(url).pathname.split('/asechka-website')[1];
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, body });
    if (path === '/git/ref/heads/main') return Response.json({ object: { sha: sha('1') } });
    if (path === '/contents/dist/memories.json') return Response.json({ type: 'file', encoding: 'base64', sha: sha('2'), size: 100, content: Buffer.from(JSON.stringify(data)).toString('base64') });
    if (path === '/git/commits/' + sha('1')) return Response.json({ tree: { sha: sha('3') } });
    if (path === '/git/trees') {
      assert.equal(body.base_tree, sha('3'));
      assert.deepEqual(body.tree.map(entry => entry.path), ['dist/memories.json']);
      pending = JSON.parse(body.tree[0].content);
      return Response.json({ sha: sha('4') });
    }
    if (path === '/git/commits') return Response.json({ sha: sha('5') });
    if (path === '/git/refs/heads/main') { assert.equal(body.force, false); data = pending; return Response.json({ object: { sha: sha('5') } }); }
    throw new Error('Unexpected mock path: ' + path);
  } });
  const visible = server.editableMemories(data).photos[0];
  const input = { action: 'updatePhoto', operationId: randomUUID(), id: visible.editKey, expectedVersion: visible.editVersion, date, caption: visible.caption, collection: 'photography' };
  const saved = await store.change(input);
  assert.equal(saved.photos[0].collection, 'photography');
  assert.equal(saved.photos[0].src, original.src);
  assert.equal(saved.photos[0].createdAt, original.createdAt);
  assert.equal(calls.some(call => call.path === '/git/blobs'), false);
  assert.deepEqual(await store.change(input), saved);
  assert.equal(calls.filter(call => call.path === '/git/trees').length, 1);
  await assert.rejects(store.change({ ...input, collection: 'memories' }), conflict);
});
