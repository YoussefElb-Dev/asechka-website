import { messageChange } from './messages.js';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from 'redis';
import { UUID, photoPath, dailyMemory } from './daily-memory.js';
import { addHearts, validHeartDay, saveSharedStreak, HEART_VIBES } from './heart-counts.js';
import { checkedPromptChange, applyPromptAnswer } from './daily-prompt.js';

const repo = 'https://api.github.com/repos/YoussefElb-Dev/asechka-website';
const SHA = /^[a-f0-9]{40}$/;
const PHOTO_LIMIT = 320000;
const HOT_ACTIONS = new Set(['sendHeart', 'sendMessage', 'closeMessage', 'pinMessage', 'answerPrompt']);
const HOT_ENVELOPE = Buffer.from('ASECHKA-TOGETHER-HOT-1');

export class TogetherError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function checkedTogether(data) {
  const ids = new Set();
  if (!data || data.version !== 1 || !Array.isArray(data.bucketList) || data.bucketList.length > 200 || !data.hearts) {
    throw new TogetherError('Our little plans couldn’t be read. Nothing has been changed.');
  }
  for (const item of data.bucketList) {
    if (!UUID.test(item.id) || ids.has(item.id) || !UUID.test(item.revision) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 140 ||
      typeof item.note !== 'string' || item.note.length > 1000 || typeof item.place !== 'string' || item.place.length > 140 || typeof item.completed !== 'boolean' ||
      !timestamp(item.createdAt) || !(item.completedAt === null || timestamp(item.completedAt)) || !(item.photoId === null || UUID.test(item.photoId))) {
      throw new TogetherError('Our little plans couldn’t be read. Nothing has been changed.');
    }
    ids.add(item.id);
  }
  for (const who of ['me', 'asechka']) {
    const heart = data.hearts[who];
    if (heart !== null && (!heart || !UUID.test(heart.id) || !timestamp(heart.sentAt))) {
      throw new TogetherError('Our little hearts couldn’t be read. Nothing has been changed.');
    }
  }
  return data;
}

export function checkedPhoto(value) {
  if (typeof value !== 'string' || !value.startsWith('data:image/jpeg;base64,') || value.length > Math.ceil(PHOTO_LIMIT / 3) * 4 + 30) {
    throw new TogetherError('Choose a JPG, PNG, or WebP photo and try again.', 400);
  }
  const encoded = value.slice(23);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new TogetherError('This photo couldn’t be read. Choose it again.', 400);
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 20 || bytes.length > PHOTO_LIMIT || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
    throw new TogetherError('This photo couldn’t be read. Choose it again.', 400);
  }
  let position = 2, dimensions;
  while (position + 4 < bytes.length) {
    if (bytes[position] !== 255) break;
    const marker = bytes[position + 1];
    if (marker === 218 || marker === 217) break;
    if (marker === 255) { position++; continue; }
    const length = bytes.readUInt16BE(position + 2);
    if (length < 2 || position + 2 + length > bytes.length) break;
    if ([192, 193, 194].includes(marker) && length >= 8) {
      dimensions = { height: bytes.readUInt16BE(position + 5), width: bytes.readUInt16BE(position + 7) };
      break;
    }
    position += length + 2;
  }
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 2000 || dimensions.height > 2000) {
    throw new TogetherError('This photo couldn’t be read. Choose it again.', 400);
  }
  return bytes;
}

export function checkedTogetherChange(input) {
  const actions = ['saveItem', 'toggleItem', 'removeItem', 'sendHeart', 'sendMessage', 'closeMessage', 'pinMessage', 'answerPrompt'];
  if (!input || !actions.includes(input.action) || !UUID.test(input.operationId)) {
    throw new TogetherError('Please try that little change again.', 400);
  }
  if (input.action === 'answerPrompt') {
    try { return checkedPromptChange(input); }
    catch (error) { throw new TogetherError(error.message, error.status || 400); }
  }
  if (['sendMessage', 'closeMessage', 'pinMessage'].includes(input.action)) {
    if (!['asnat', 'youssef'].includes(input.actor) || (['closeMessage', 'pinMessage'].includes(input.action) && !UUID.test(input.id))) {
      throw new TogetherError('Choose a message and profile first.', 400);
    }
    if (input.action === 'sendMessage' && input.mode !== undefined && !['once', 'jar'].includes(input.mode)) {
      throw new TogetherError('Choose either Love Jar or just-once for this note.', 400);
    }
    return {
      action: input.action,
      operationId: input.operationId,
      actor: input.actor,
      id: input.id,
      text: input.text,
      ...(input.mode ? { mode: input.mode } : {}),
      ...(input.pinned !== undefined ? { pinned: Boolean(input.pinned) } : {}),
    };
  }
  if (input.action === 'sendHeart') {
    if (!['me', 'asechka'].includes(input.from)) throw new TogetherError('Choose who is sending this little heart.', 400);
    const count = input.count ?? 1;
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000000 || input.day !== undefined && !validHeartDay(input.day)) {
      throw new TogetherError('This heart count could not be read. Please try again.', 400);
    }
    if (input.vibe !== undefined && input.vibe !== '' && !HEART_VIBES.includes(input.vibe)) {
      throw new TogetherError('Choose one of our heart vibes or leave it blank.', 400);
    }
    return {
      action: input.action,
      operationId: input.operationId,
      from: input.from,
      count,
      ...(input.day ? { day: input.day } : {}),
      ...(input.vibe ? { vibe: input.vibe } : {}),
    };
  }
  if (!UUID.test(input.id) || !(input.expectedRevision === null || UUID.test(input.expectedRevision))) {
    throw new TogetherError('Choose a plan and try again.', 400);
  }
  const change = { action: input.action, id: input.id, operationId: input.operationId, expectedRevision: input.expectedRevision };
  if (input.action !== 'removeItem') {
    if (typeof input.completed !== 'boolean') throw new TogetherError('Choose whether this plan is complete.', 400);
    change.completed = input.completed;
  }
  if (input.action === 'saveItem') {
    for (const [key, max] of [['title', 140], ['place', 140], ['note', 1000]]) {
      if (typeof input[key] !== 'string' || input[key].length > max) {
        throw new TogetherError('Keep the title and place under 140 characters, and the note under 1,000.', 400);
      }
    }
    if (!input.title.trim()) throw new TogetherError('Give your little plan a title.', 400);
    Object.assign(change, { title: input.title.trim(), place: input.place.trim(), note: input.note.trim() });
    if (input.photo !== undefined) {
      if (!input.completed) throw new TogetherError('Mark this plan complete to add your memory photo.', 400);
      change.photo = checkedPhoto(input.photo);
    }
  }
  return change;
}

export function changeTogether(base, change, now = new Date()) {
  checkedTogether(base);
  const data = structuredClone(base), time = now.toISOString();
  if (change.action === 'answerPrompt') {
    try { if (!applyPromptAnswer(data, change, now)) return { data: base, changed: false }; }
    catch (error) { throw new TogetherError(error.message, error.status || 400); }
  } else if (['sendMessage', 'closeMessage', 'pinMessage'].includes(change.action)) {
    try { if (!messageChange(data, change, now)) return { data: base, changed: false }; }
    catch (error) { throw new TogetherError(error.message, error.status || 400); }
  } else if (change.action === 'sendHeart') {
    try { if (!addHearts(data, change, now)) return { data: base, changed: false }; }
    catch (error) { throw new TogetherError(error.message, error.status || 400); }
  } else {
    const index = data.bucketList.findIndex(item => item.id === change.id), current = data.bucketList[index];
    if (current?.revision === change.operationId || change.action === 'removeItem' && !current) return { data: base, changed: false };
    if ((current?.revision ?? null) !== change.expectedRevision) throw new TogetherError('This plan just changed on the other screen. Refresh it and try again.', 409);
    if (change.action === 'removeItem') data.bucketList.splice(index, 1);
    else if (change.action === 'toggleItem') {
      if (!current) throw new TogetherError('This little plan has moved. Refresh the list.', 409);
      if (current.completed === change.completed) return { data: base, changed: false };
      Object.assign(current, { completed: change.completed, completedAt: change.completed ? time : null, revision: change.operationId });
    } else {
      if (!current && data.bucketList.length >= 200) throw new TogetherError('Our list is full of lovely plans. Finish or remove one before adding another.', 400);
      const item = {
        id: change.id, title: change.title, note: change.note, place: change.place, completed: change.completed,
        createdAt: current?.createdAt || time, completedAt: change.completed ? current?.completedAt || time : null,
        revision: change.operationId, photoId: change.photo ? change.operationId : current?.photoId || null,
      };
      if (current) data.bucketList[index] = item; else data.bucketList.push(item);
    }
  }
  saveSharedStreak(data, now);
  data.updatedAt = time;
  return { data, changed: true };
}

export function mergeHotState(base, hot) {
  if (!hot || typeof hot !== 'object') return base;
  const merged = structuredClone(base);
  // Hearts: keep latest sentAt per side.
  for (const who of ['me', 'asechka']) {
    const b = merged.hearts?.[who], h = hot.hearts?.[who];
    if (h && (!b || Date.parse(h.sentAt || 0) >= Date.parse(b.sentAt || 0))) merged.hearts[who] = h;
  }
  // Heart days: monotonic max per day & side so zero historical hearts can ever be lost.
  merged.heartDays ||= {};
  for (const [day, counts] of Object.entries(hot.heartDays || {})) {
    const target = merged.heartDays[day] ||= { me: 0, asechka: 0 };
    target.me = Math.max(Number(target.me) || 0, Number(counts?.me) || 0);
    target.asechka = Math.max(Number(target.asechka) || 0, Number(counts?.asechka) || 0);
  }
  // Heart operations: union bounded to 512.
  merged.heartOperations = { ...(merged.heartOperations || {}), ...(hot.heartOperations || {}) };
  const opKeys = Object.keys(merged.heartOperations);
  if (opKeys.length > 512) {
    for (const old of opKeys.slice(0, opKeys.length - 512)) delete merged.heartOperations[old];
  }
  // Heart vibes: latest sentAt per side.
  if (hot.heartVibes || merged.heartVibes) {
    merged.heartVibes ||= {};
    for (const who of ['me', 'asechka']) {
      const b = merged.heartVibes[who], h = hot.heartVibes?.[who];
      if (h && (!b || Date.parse(h.sentAt || 0) >= Date.parse(b.sentAt || 0))) merged.heartVibes[who] = h;
    }
  }
  // Messages: union by id; preserve jar text and closedAt/pinned state.
  const byId = new Map((merged.messages || []).map(m => [m.id, m]));
  for (const m of hot.messages || []) {
    if (!m?.id) continue;
    const prior = byId.get(m.id);
    if (!prior) { byId.set(m.id, structuredClone(m)); continue; }
    const closedAt = m.closedAt || prior.closedAt || null;
    const next = { ...prior, ...m, closedAt };
    if (next.mode !== 'jar' && closedAt) delete next.text;
    byId.set(m.id, next);
  }
  merged.messages = [...byId.values()].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  // Daily prompts: union by day & actor.
  if (hot.dailyPrompts || merged.dailyPrompts) {
    merged.dailyPrompts ||= {};
    for (const [day, entry] of Object.entries(hot.dailyPrompts || {})) {
      const target = merged.dailyPrompts[day] ||= { prompt: entry.prompt, answers: {} };
      target.prompt ||= entry.prompt;
      target.answers ||= {};
      for (const who of ['asnat', 'youssef']) {
        const incoming = entry?.answers?.[who];
        if (!incoming) continue;
        const existing = target.answers[who];
        const incomingMs = Date.parse(incoming.answeredAt || '') || 0;
        const existingMs = Date.parse(existing?.answeredAt || '') || 0;
        if (!existing || incomingMs >= existingMs) target.answers[who] = incoming;
      }
    }
  }
  if (hot.updatedAt && (!merged.updatedAt || Date.parse(hot.updatedAt) > Date.parse(merged.updatedAt))) {
    merged.updatedAt = hot.updatedAt;
  }
  return merged;
}

function extractHotState(data) {
  return {
    hearts: data.hearts,
    heartDays: data.heartDays || {},
    heartOperations: data.heartOperations || {},
    heartVibes: data.heartVibes || {},
    messages: data.messages || [],
    dailyPrompts: data.dailyPrompts || {},
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}

export class GitHubTogetherStore {
  constructor({
    token = () => process.env.MUSIC_GITHUB_TOKEN,
    fetcher = fetch,
    now = () => Date.now(),
    fallback = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8'),
    redisUrl = () => process.env.REDIS_URL,
    redisClient = null,
    redisPrefix = process.env.VERCEL_ENV === 'preview' ? `asechka:together:preview:${process.env.VERCEL_GIT_COMMIT_REF || 'default'}` : 'asechka:together:v1',
    secret = () => process.env.SESSION_SECRET,
  } = {}) {
    this.token = token;
    this.fetcher = fetcher;
    this.now = now;
    this.fallback = fallback;
    this.redisUrl = redisUrl;
    this.redisClient = redisClient;
    this.redisPrefix = redisPrefix;
    this.secret = secret;
    this.redisConnecting = null;
    this.cache = new Map();
    this.photos = new Map();
  }
  get writable() { return !!this.token() || (this.constructor === GitHubTogetherStore && this.hasRedis()); }
  hasRedis() { return Boolean(this.redisClient || (typeof this.redisUrl === 'function' ? this.redisUrl() : this.redisUrl)); }
  hotKey() { return `${this.redisPrefix}:hot`; }
  sealHot(value) {
    const raw = JSON.stringify(value);
    const secret = typeof this.secret === 'function' ? this.secret() : this.secret;
    if (typeof secret !== 'string' || secret.length < 32) return 'plain:' + raw;
    const key = createHash('sha256').update('asechka-together-hot-v1\0' + secret).digest();
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(HOT_ENVELOPE);
    const enc = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
    return 'enc:' + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
  }
  openHot(stored) {
    if (!stored || typeof stored !== 'string') return null;
    try {
      if (stored.startsWith('plain:')) return JSON.parse(stored.slice(6));
      if (stored.startsWith('enc:')) {
        const secret = typeof this.secret === 'function' ? this.secret() : this.secret;
        if (typeof secret !== 'string' || secret.length < 32) return null;
        const key = createHash('sha256').update('asechka-together-hot-v1\0' + secret).digest();
        const buf = Buffer.from(stored.slice(4), 'base64');
        const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
        decipher.setAAD(HOT_ENVELOPE);
        decipher.setAuthTag(buf.subarray(12, 28));
        return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8'));
      }
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  async connectRedis() {
    if (this.redisClient) return this.redisClient;
    const urlString = typeof this.redisUrl === 'function' ? this.redisUrl() : this.redisUrl;
    if (!urlString) return null;
    if (!this.redisConnecting) {
      this.redisConnecting = (async () => {
        const parsed = new URL(urlString);
        if (parsed.protocol !== 'rediss:' && !(parsed.protocol === 'redis:' && ['localhost', '127.0.0.1', 'redis'].includes(parsed.hostname))) {
          throw new TogetherError('Live storage needs TLS.', 503);
        }
        const c = createClient({ url: urlString, socket: { connectTimeout: 4000, reconnectStrategy: false } });
        c.on('error', () => {});
        await c.connect();
        this.redisClient = c;
        return c;
      })().catch(error => { this.redisConnecting = null; throw error; });
    }
    return this.redisConnecting;
  }
  async readHot() {
    if (!this.hasRedis()) return null;
    try {
      const client = await this.connectRedis();
      if (!client) return null;
      return this.openHot(await client.get(this.hotKey()));
    } catch {
      return null;
    }
  }
  async writeHot(data) {
    const client = await this.connectRedis();
    if (!client) return false;
    await client.set(this.hotKey(), this.sealHot(extractHotState(data)));
    return true;
  }
  async github(path, method = 'GET', body) {
    let response;
    try {
      response = await this.fetcher(repo + path, {
        method, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${this.token()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json', 'User-Agent': 'Asechka-Together' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new TogetherError('Our shared connection is taking a little longer. Please try again.'); }
    if (!response.ok) {
      if (method === 'PATCH' && [409, 422].includes(response.status)) throw new TogetherError('Our plans changed while we were saving.', 409);
      throw new TogetherError('Our shared connection needs a little attention. Your memories are safe.');
    }
    try { return await response.json(); } catch { throw new TogetherError('Our shared connection couldn’t be read. Try again shortly.'); }
  }
  async file(path, ref = 'main') {
    let file = await this.github(`/contents/${path}?ref=${ref}`);
    if (file.type !== 'file' || file.size > 10000000 || !SHA.test(file.sha)) throw new TogetherError('This little memory couldn’t be read. Nothing has been changed.');
    if (file.encoding === 'none') file = await this.github(`/git/blobs/${file.sha}`);
    if (file.encoding !== 'base64' || typeof file.content !== 'string') throw new TogetherError('This little memory couldn’t be read. Nothing has been changed.');
    return Buffer.from(file.content, 'base64');
  }
  async jsonFile(path, { ref = 'main', fresh = false } = {}) {
    if (!this.token()) return JSON.parse(await this.fallback(path));
    const cached = this.cache.get(path);
    if (ref === 'main' && !fresh && cached?.until > this.now()) return structuredClone(cached.data);
    let data;
    try { data = JSON.parse((await this.file(path, ref)).toString('utf8')); }
    catch (error) { if (error instanceof TogetherError) throw error; throw new TogetherError('Our saved memories couldn’t be read. Nothing has been changed.'); }
    if (ref === 'main') this.cache.set(path, { data, until: this.now() + 5000 });
    return data;
  }
  async read(options = {}) {
    const base = checkedTogether(await this.jsonFile('dist/together.json', options));
    if (options.skipHot) return base;
    const hot = await this.readHot();
    return hot ? checkedTogether(mergeHotState(base, hot)) : base;
  }
  async memory() {
    const [memories, music] = await Promise.all([this.jsonFile('dist/memories.json'), this.jsonFile('dist/music.json')]);
    return dailyMemory(memories, music, new Date(this.now()));
  }
  async photo(kind, id) {
    if (!UUID.test(id) || !['bucket', 'memory'].includes(kind)) throw new TogetherError('This picture couldn’t be found.', 404);
    let path;
    if (kind === 'bucket') {
      if (!(await this.read({ skipHot: true })).bucketList.some(item => item.photoId === id)) throw new TogetherError('This picture couldn’t be found.', 404);
      path = `dist/assets/bucket/${id}.jpg`;
    } else {
      const photo = (await this.jsonFile('dist/memories.json', { fresh: true })).photos?.find(photo => photo.id === id && photoPath.test(photo.src));
      if (!photo) throw new TogetherError('This picture couldn’t be found.', 404);
      path = `dist/${photo.src}`;
    }
    const cached = this.photos.get(path);
    if (cached) return cached;
    const bytes = this.token() ? await this.file(path) : await readFile(new URL(`../${path}`, import.meta.url));
    const image = { bytes, type: path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg' };
    if (this.photos.size >= 10) this.photos.delete(this.photos.keys().next().value);
    this.photos.set(path, image);
    return image;
  }
  async changeHotInRedis(change) {
    const client = await this.connectRedis();
    if (!client) return null;
    const base = checkedTogether(await this.jsonFile('dist/together.json'));
    const key = this.hotKey();
    const useWatch = typeof client.watch === 'function' && typeof client.multi === 'function';
    for (let attempt = 0; attempt < 4; attempt++) {
      if (useWatch) await client.watch(key);
      try {
        const currentHot = this.openHot(await client.get(key));
        const merged = currentHot ? checkedTogether(mergeHotState(base, currentHot)) : base;
        const update = changeTogether(merged, change, new Date(this.now()));
        if (!update.changed) {
          if (useWatch && typeof client.unwatch === 'function') await client.unwatch();
          return merged;
        }
        const payload = this.sealHot(extractHotState(update.data));
        if (useWatch) {
          const result = await client.multi().set(key, payload).exec();
          if (result !== null) return update.data;
          continue;
        }
        await client.set(key, payload);
        return update.data;
      } catch (error) {
        if (useWatch && typeof client.unwatch === 'function') await client.unwatch().catch(() => {});
        throw error;
      }
    }
    throw new TogetherError('Another update landed at the same moment. Try again.', 409);
  }
  async change(input) {
    if (!this.writable) throw new TogetherError('Shared saving is still being connected. Try again shortly.');
    const change = checkedTogetherChange(input);
    // High-frequency state (hearts, vibes, Love Jar notes, daily prompt) writes to Redis
    // without triggering Git commits or Vercel deployments.
    if (HOT_ACTIONS.has(change.action) && this.hasRedis()) {
      try {
        const updated = await this.changeHotInRedis(change);
        if (updated) return updated;
      } catch (error) {
        if (error instanceof TogetherError && error.status >= 400 && error.status < 500) throw error;
        if (!this.token()) throw error;
      }
    }
    if (!this.token()) throw new TogetherError('Shared saving is still being connected. Try again shortly.');
    let photoBlob;
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await this.github('/git/ref/heads/main'), sha = ref.object?.sha;
      if (!SHA.test(sha)) throw new TogetherError('Our shared connection couldn’t be read. Nothing has been changed.');
      const rawBase = await this.read({ ref: sha, fresh: true, skipHot: true });
      const hot = await this.readHot();
      const base = hot ? checkedTogether(mergeHotState(rawBase, hot)) : rawBase;
      const update = changeTogether(base, change, new Date(this.now()));
      if (!update.changed) return base;
      const parent = await this.github(`/git/commits/${sha}`);
      if (!SHA.test(parent.tree?.sha)) throw new TogetherError('Our shared connection couldn’t be read. Nothing has been changed.');
      const entries = [{ path: 'dist/together.json', mode: '100644', type: 'blob', content: JSON.stringify(update.data, null, 2) + '\n' }];
      if (change.photo) {
        photoBlob ||= await this.github('/git/blobs', 'POST', { encoding: 'base64', content: change.photo.toString('base64') });
        if (!SHA.test(photoBlob.sha)) throw new TogetherError('Your picture couldn’t be saved. Please try again.');
        entries.push({ path: `dist/assets/bucket/${change.operationId}.jpg`, mode: '100644', type: 'blob', sha: photoBlob.sha });
      }
      const previousPhoto = base.bucketList.find(item => item.id === change.id)?.photoId;
      if (previousPhoto && (change.action === 'removeItem' || change.photo)) entries.push({ path: `dist/assets/bucket/${previousPhoto}.jpg`, mode: '100644', type: 'blob', sha: null });
      const tree = await this.github('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: entries });
      if (!SHA.test(tree.sha)) throw new TogetherError('Our little plans couldn’t be saved. Please try again.');
      const commitMessage = change.action === 'sendHeart' ? 'Leave a little thinking-of-you heart'
        : change.action === 'answerPrompt' ? 'Answer today’s shared question'
        : change.action === 'removeItem' ? 'Remove a little shared plan'
        : 'Save a little shared plan';
      const commit = await this.github('/git/commits', 'POST', { message: commitMessage, tree: tree.sha, parents: [sha] });
      if (!SHA.test(commit.sha)) throw new TogetherError('Our little plans couldn’t be saved. Please try again.');
      try {
        await this.github('/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
        this.cache.clear();
        if (this.hasRedis()) { try { await this.writeHot(update.data); } catch {} }
        return update.data;
      } catch (error) {
        this.cache.clear();
        if (!(error instanceof TogetherError) || error.status !== 409) throw error;
        // A moving Git branch is temporary infrastructure contention, not a stale user edit.
        if (attempt === 2) throw new TogetherError('Your change is safe on this phone. We’ll retry the shared save shortly.', 503);
      }
    }
  }
}
