import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { GitHubTogetherStore, TogetherError, checkedPhoto } from './together-store.js';
import { UUID } from './daily-memory.js';

const SHA = /^[a-f0-9]{40}$/;
const fail = (message, status = 503) => { throw new TogetherError(message, status); };
const people = ['asnat', 'youssef'];
const hash = value => createHash('sha256').update(value).digest('hex');
const envelope = Buffer.from('ASECHKA-FILM-1');
export function cameraKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) fail('Our camera encryption needs its connection restored.');
  return createHash('sha256').update('asechka-camera-v1\0' + secret).digest();
}
export function sealFilm(bytes, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(envelope);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([envelope, iv, cipher.getAuthTag(), encrypted]);
}
export function openFilm(bytes, key) {
  try {
    if (bytes.length < envelope.length + 28 || !bytes.subarray(0, envelope.length).equals(envelope)) throw Error();
    const offset = envelope.length, decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(offset, offset + 12));
    decipher.setAAD(envelope); decipher.setAuthTag(bytes.subarray(offset + 12, offset + 28));
    return Buffer.concat([decipher.update(bytes.subarray(offset + 28)), decipher.final()]);
  } catch { fail('This film couldn’t be unlocked. Restore the original camera encryption secret.'); }
}
export function storedCamera(data, key) {
  const stored = checkedCamera(data);
  for (const roll of stored.rolls) for (const shot of roll.shots) { shot.sealedCaption = sealFilm(Buffer.from(shot.caption, 'utf8'), key).toString('base64'); delete shot.caption; }
  return stored;
}
function unlockedCamera(value, key) {
  const data = structuredClone(value);
  if (!Array.isArray(data?.rolls)) fail('Our film collection couldn’t be read.');
  for (const roll of data.rolls) {
    if (!Array.isArray(roll.shots)) fail('Our film collection couldn’t be read.');
    for (const shot of roll.shots) {
      if (typeof shot.sealedCaption !== 'string' || shot.sealedCaption.length > 2000 || Object.hasOwn(shot, 'caption')) fail('This film couldn’t be unlocked.');
      shot.caption = openFilm(Buffer.from(shot.sealedCaption, 'base64'), key).toString('utf8'); delete shot.sealedCaption;
    }
  }
  return checkedCamera(data);
}
export function checkedCamera(data) {
  if (data?.version !== 1 || !Array.isArray(data.rolls) || data.rolls.length > 100) fail('Our film collection couldn’t be read.');
  const ids = new Set(); let active = 0;
  for (const roll of data.rolls) {
    if (!UUID.test(roll.id || '') || ids.has(roll.id) || typeof roll.title !== 'string' || !roll.title.trim() || roll.title.length > 80 || !people.includes(roll.actor) || !Number.isFinite(Date.parse(roll.createdAt)) || !(roll.developedAt === null || Number.isFinite(Date.parse(roll.developedAt))) || !Array.isArray(roll.shots) || roll.shots.length > 24) fail('Our film collection couldn’t be read.');
    ids.add(roll.id); if (!roll.developedAt) active++;
    if (roll.developedAt && roll.shots.length !== 24) fail('This roll isn’t ready to develop.');
    for (const shot of roll.shots) {
      if (!UUID.test(shot.id || '') || ids.has(shot.id) || !people.includes(shot.actor) || !Number.isFinite(Date.parse(shot.createdAt)) || typeof shot.caption !== 'string' || shot.caption.length > 240 || !/^[a-f0-9]{64}$/.test(shot.hash || '') || !shot.reactions || people.some(person => !['', '♡', '😂', '🥹', '✨'].includes(shot.reactions[person]))) fail('Our film collection couldn’t be read.');
      ids.add(shot.id);
    }
  }
  if (active > 1) fail('Our film collection couldn’t be read.');
  return structuredClone(data);
}
export function cameraView(data) {
  return { version: 1, rolls: checkedCamera(data).rolls.map(roll => ({ ...roll, shots: roll.shots.map(shot => roll.developedAt ? { id: shot.id, actor: shot.actor, createdAt: shot.createdAt, caption: shot.caption, reactions: shot.reactions } : { id: shot.id, actor: shot.actor, createdAt: shot.createdAt }) })) };
}
export function checkedCameraChange(input) {
  if (!input || !['create', 'capture', 'develop', 'react'].includes(input.action) || !UUID.test(input.operationId || '') || !people.includes(input.actor)) fail('Choose your profile and try again.', 400);
  const change = { action: input.action, operationId: input.operationId, actor: input.actor };
  if (input.action === 'create') {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 80) fail('Give this roll a name, up to 80 characters.', 400);
    change.title = input.title.trim();
  } else {
    if (!UUID.test(input.rollId || '')) fail('Open this roll again.', 400);
    change.rollId = input.rollId;
  }
  if (input.action === 'capture') {
    if (typeof input.caption !== 'string' || input.caption.length > 240) fail('Keep your caption under 240 characters.', 400);
    change.caption = input.caption.trim(); change.photo = checkedPhoto(input.photo); change.hash = hash(change.photo);
  }
  if (input.action === 'react') {
    if (!UUID.test(input.shotId || '') || !['', '♡', '😂', '🥹', '✨'].includes(input.reaction)) fail('Choose a reaction for this frame.', 400);
    change.shotId = input.shotId; change.reaction = input.reaction;
  }
  return change;
}
export function changeCamera(base, change, now = new Date()) {
  const data = checkedCamera(base), time = now.toISOString();
  if (change.action === 'create') {
    const existing = data.rolls.find(roll => roll.id === change.operationId);
    if (existing) {
      if (existing.title !== change.title || existing.actor !== change.actor) fail('That save was already used for another roll.', 409);
      return { data, changed: false };
    }
    if (data.rolls.some(roll => !roll.developedAt)) fail('Finish our current roll before loading a new one.', 409);
    if (data.rolls.length >= 100) fail('Our camera has reached its 100-roll collection limit.', 409);
    data.rolls.push({ id: change.operationId, title: change.title, actor: change.actor, createdAt: time, developedAt: null, shots: [] });
  } else {
    const roll = data.rolls.find(roll => roll.id === change.rollId);
    if (!roll) fail('This roll couldn’t be found. Refresh our camera.', 404);
    if (change.action === 'capture') {
      const existing = roll.shots.find(shot => shot.id === change.operationId);
      if (existing) {
        if (existing.hash !== change.hash || existing.actor !== change.actor || existing.caption !== change.caption) fail('That shot was already saved with different details.', 409);
        return { data, changed: false };
      }
      if (data.rolls.some(other => other.shots.some(shot => shot.id === change.operationId)) || data.rolls.some(other => other.id === change.operationId)) fail('Try a new shot.', 409);
      if (roll.developedAt || roll.shots.length >= 24) fail('This roll is full. Your picture hasn’t been added. Open the camera to develop it.', 409);
      roll.shots.push({ id: change.operationId, actor: change.actor, createdAt: time, caption: change.caption, hash: change.hash, reactions: { asnat: '', youssef: '' } });
    } else if (change.action === 'develop') {
      if (roll.developedAt) return { data, changed: false };
      if (roll.shots.length !== 24) fail('All 24 frames need a moment before we can develop this roll.', 409);
      roll.developedAt = time;
    } else {
      if (!roll.developedAt) fail('Develop the roll before reacting to its pictures.', 409);
      const shot = roll.shots.find(shot => shot.id === change.shotId);
      if (!shot) fail('This frame couldn’t be found.', 404);
      if (shot.reactions[change.actor] === change.reaction) return { data, changed: false };
      shot.reactions[change.actor] = change.reaction;
    }
  }
  return { data: checkedCamera(data), changed: true };
}
export class GitHubCameraStore extends GitHubTogetherStore {
  constructor({ secret = () => process.env.SESSION_SECRET, ...options } = {}) { super(options); this.secret = secret; }
  async read(options) { return unlockedCamera(await this.jsonFile('private/camera.json', options), cameraKey(this.secret())); }
  async photo(id) {
    if (!UUID.test(id || '')) fail('Frame not found.', 404);
    const data = await this.read({ fresh: true });
    if (!data.rolls.some(roll => roll.developedAt && roll.shots.some(shot => shot.id === id))) fail('This frame is still sealed.', 404);
    const path = `private/camera/${id}.bin`;
    const bytes = this.writable ? await this.file(path) : await readFile(new URL(`../${path}`, import.meta.url));
    if (!bytes || bytes.length > 320100) fail('This frame couldn’t be read.');
    return openFilm(bytes, cameraKey(this.secret()));
  }
  async change(input) {
    if (!this.writable) fail('Reconnect our shared camera before saving.');
    const change = checkedCameraChange(input); let blob;
    for (let attempt = 0; attempt < 5; attempt++) {
      const ref = await this.github('/git/ref/heads/main'), sha = ref.object?.sha;
      if (!SHA.test(sha || '')) fail('Our camera connection couldn’t be read.');
      const base = await this.read({ ref: sha, fresh: true }), update = changeCamera(base, change, new Date(this.now()));
      if (!update.changed) return update.data;
      const parent = await this.github(`/git/commits/${sha}`);
      if (!SHA.test(parent.tree?.sha || '')) fail('Our camera connection couldn’t be read.');
      const key = cameraKey(this.secret());
      const entries = [{ path: 'private/camera.json', mode: '100644', type: 'blob', content: JSON.stringify(storedCamera(update.data, key), null, 2) + '\n' }];
      if (change.photo) {
        blob ||= await this.github('/git/blobs', 'POST', { encoding: 'base64', content: sealFilm(change.photo, key).toString('base64') });
        if (!SHA.test(blob.sha || '')) fail('Our camera connection couldn’t be read.');
        entries.push({ path: `private/camera/${change.operationId}.bin`, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const tree = await this.github('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: entries });
      if (!SHA.test(tree.sha || '')) fail('Our camera connection couldn’t be read.');
      const commit = await this.github('/git/commits', 'POST', { message: 'Keep a moment in our shared film camera', tree: tree.sha, parents: [sha] });
      if (!SHA.test(commit.sha || '')) fail('Our camera connection couldn’t be read.');
      try { await this.github('/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false }); this.cache.clear(); return update.data; }
      catch (error) { this.cache.clear(); if (!(error instanceof TogetherError) || error.status !== 409 || attempt === 4) throw error; }
    }
  }
}
