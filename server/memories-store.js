import { createHash } from 'node:crypto';
import { GitHubTogetherStore, TogetherError, checkedPhoto } from './together-store.js';
import { UUID, photoPath } from './daily-memory.js';
const SHA = /^[a-f0-9]{40}$/;
const VERSION = /^[a-f0-9]{64}$/;
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const conflict = () => { throw new TogetherError('This memory changed while you were editing. Close this window and open Edit again to see the latest version. Your words are still here to copy.', 409); };
function editKey(item, index, kind) {
  if (UUID.test(item?.id || '')) return item.id;
  const hash = fingerprint([kind, index, item]);
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
}
export function editableMemories(value) {
  const data = checkedMemories(value);
  for (const kind of ['quotes', 'photos']) data[kind] = data[kind].map((item, index) => ({
    ...(typeof item === 'string' ? { text: item } : item),
    editKey: editKey(item, index, kind), editVersion: fingerprint(item),
  }));
  return data;
}
const fail = message => { throw new TogetherError(message, 400); };
export function checkedMemoryChange(input) {
  if (!input || !['addQuote', 'addPhoto', 'updateQuote', 'updatePhoto', 'removeQuote', 'removePhoto'].includes(input.action) || !UUID.test(input.operationId || '')) fail('Choose a quote or picture to keep.');
  const change = { action: input.action, operationId: input.operationId };
  if (!input.action.startsWith('add')) {
    if (!UUID.test(input.id || '') || !VERSION.test(input.expectedVersion || '')) fail('Open this memory again before changing it.');
    Object.assign(change, { id: input.id, expectedVersion: input.expectedVersion });
  }
  if (input.action.startsWith('remove')) return change;
  if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
      || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date) fail('Choose a valid date for this memory.');
  const text = (value, max, required = false) => {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('This memory is blank or a little too long.');
    return value.trim();
  };
  change.date = input.date;
  if (input.action.endsWith('Quote')) {
    change.text = text(input.text, 10000, true); change.note = text(input.note ?? '', 1000);
  } else {
    change.caption = text(input.caption ?? '', 1000);
    change.photo = input.photo === undefined && input.action === 'updatePhoto' ? null : checkedPhoto(input.photo);
    if (!change.photo && input.action === 'addPhoto') fail('Choose the picture you want to keep.');
    if (change.photo) change.contentHash = createHash('sha256').update(change.photo).digest('hex');
  }
  return change;
}
export function checkedMemories(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.quotes) || !Array.isArray(value.photos)
      || value.quotes.some(q => typeof q !== 'string' && (!q || typeof q.text !== 'string'))
      || value.photos.some(p => !p || typeof p.src !== 'string' || !photoPath.test(p.src)))
    throw new TogetherError('Our saved collection could not be read. Nothing has been changed.');
  return structuredClone(value);
}
export function appendMemory(base, change, now = new Date()) {
  const data = checkedMemories(base), photo = change.action.endsWith('Photo');
  const collection = photo ? data.photos : data.quotes;
  if (!change.action.startsWith('add')) {
    const index = collection.findIndex((item, i) => editKey(item, i, photo ? 'photos' : 'quotes') === change.id);
    if (index < 0) {
      if (change.action.startsWith('remove')) return { data, changed: false };
      conflict();
    }
    const previous = collection[index];
    if (previous?.revision === change.operationId && !change.action.startsWith('remove')) {
      if (previous.date !== change.date || (photo ? previous.caption !== change.caption || change.photo && previous.contentHash !== change.contentHash : previous.text !== change.text || (previous.note || '') !== change.note)) conflict();
      return { data, changed: false };
    }
    if (fingerprint(previous) !== change.expectedVersion) conflict();
    let item;
    if (change.action.startsWith('remove')) collection.splice(index, 1);
    else {
      item = { ...(typeof previous === 'string' ? {} : previous), id: change.id, date: change.date, revision: change.operationId };
      if (photo) {
        Object.assign(item, { caption: change.caption, alt: change.caption || 'A picture of us' });
        if (change.photo) Object.assign(item, { src: photoFilename(change), contentHash: change.contentHash });
      } else {
        item.text = change.text;
        if (change.note) item.note = change.note; else delete item.note;
      }
      collection[index] = item;
    }
    data.updatedAt = now.toISOString(); checkSize(data);
    const removedPhoto = photo && (change.photo || !item) && !data.photos.some(p => p.src === previous.src) ? previous.src : undefined;
    return { data, changed: true, item, removedPhoto };
  }
  const other = (photo ? data.quotes : data.photos).some(item => item?.id === change.operationId);
  const existing = collection.find(item => item?.id === change.operationId);
  if (other || existing && (existing.date !== change.date
      || (photo ? existing.caption !== change.caption || existing.contentHash !== change.contentHash
          : existing.text !== change.text || (existing.note || '') !== change.note)))
    throw new TogetherError('This saved memory changed. Review it before trying again.', 409);
  if (existing) return { data, changed: false };
  if (data.quotes.length + data.photos.length >= 5000) throw new TogetherError('Our collection is full. Please make some room before adding more.', 409);
  const item = { id: change.operationId, date: change.date };
  if (photo) Object.assign(item, { src: photoFilename(change), caption: change.caption, alt: change.caption || 'A picture of us', contentHash: change.contentHash });
  else Object.assign(item, { text: change.text, ...(change.note ? { note: change.note } : {}) });
  collection.push(item); data.updatedAt = now.toISOString();
  checkSize(data);
  return { data, changed: true, item };
}
function photoFilename(change) { return `assets/photos/${change.date.slice(0,4)}/${change.date.slice(5,7)}/${change.operationId}.jpg`; }
function checkSize(data) {
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 900000) throw new TogetherError('Our collection needs more room before saving this memory. Your draft is still here.', 409);
}
export class GitHubMemoriesStore extends GitHubTogetherStore {
  async read(options) { return checkedMemories(await this.jsonFile('dist/memories.json', options)); }
  async change(input) {
    if (!this.writable) throw new TogetherError('Shared saving needs its connection restored. Your draft is still here.');
    const change = checkedMemoryChange(input); let photoBlob;
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await this.github('/git/ref/heads/main'), sha = ref.object?.sha;
      if (!SHA.test(sha)) throw new TogetherError('Our shared connection needs a moment.');
      const update = appendMemory(await this.read({ ref: sha, fresh: true }), change, new Date(this.now()));
      if (!update.changed) return update.data;
      const parent = await this.github(`/git/commits/${sha}`);
      if (!SHA.test(parent.tree?.sha)) throw new TogetherError('Our shared connection needs a moment.');
      const entries = [{ path: 'dist/memories.json', mode: '100644', type: 'blob', content: JSON.stringify(update.data, null, 2) + '\n' }];
      if (change.photo) {
        photoBlob ||= await this.github('/git/blobs', 'POST', { encoding: 'base64', content: change.photo.toString('base64') });
        if (!SHA.test(photoBlob.sha)) throw new TogetherError('Your picture could not be saved.');
        entries.push({ path: `dist/${update.item.src}`, mode: '100644', type: 'blob', sha: photoBlob.sha });
      }
      if (update.removedPhoto) entries.push({ path: `dist/${update.removedPhoto}`, mode: '100644', type: 'blob', sha: null });
      const tree = await this.github('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: entries });
      if (!SHA.test(tree.sha)) throw new TogetherError('Our memory could not be saved.');
      const commit = await this.github('/git/commits', 'POST', { message: `${change.action.startsWith('remove') ? 'Remove' : change.action.startsWith('update') ? 'Update' : 'Keep'} a shared ${change.action.endsWith('Photo') ? 'photo' : 'quote'}`, tree: tree.sha, parents: [sha] });
      if (!SHA.test(commit.sha)) throw new TogetherError('Our memory could not be saved.');
      try {
        await this.github('/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
        this.cache.clear(); return update.data;
      } catch (error) {
        this.cache.clear();
        if (!(error instanceof TogetherError) || error.status !== 409 || attempt === 2) throw error;
      }
    }
  }
}
