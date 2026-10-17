import { createHash } from 'node:crypto';
import { GitHubTogetherStore, TogetherError, checkedPhoto } from './together-store.js';
import { UUID, photoPath } from './daily-memory.js';
const SHA = /^[a-f0-9]{40}$/;
const fail = message => { throw new TogetherError(message, 400); };
export function checkedMemoryChange(input) {
  if (!input || !['addQuote', 'addPhoto'].includes(input.action) || !UUID.test(input.operationId || '')) fail('Choose a quote or picture to keep.');
  if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
      || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date) fail('Choose a valid date for this memory.');
  const text = (value, max, required = false) => {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('This memory is blank or a little too long.');
    return value.trim();
  };
  const change = { action: input.action, operationId: input.operationId, date: input.date };
  if (input.action === 'addQuote') {
    change.text = text(input.text, 10000, true); change.note = text(input.note ?? '', 1000);
  } else {
    change.caption = text(input.caption ?? '', 1000); change.photo = checkedPhoto(input.photo);
    if (!change.photo) fail('Choose the picture you want to keep.');
    change.contentHash = createHash('sha256').update(change.photo).digest('hex');
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
  const data = checkedMemories(base), photo = change.action === 'addPhoto';
  const collection = photo ? data.photos : data.quotes;
  const other = (photo ? data.quotes : data.photos).some(item => item?.id === change.operationId);
  const existing = collection.find(item => item?.id === change.operationId);
  if (other || existing && (existing.date !== change.date
      || (photo ? existing.caption !== change.caption || existing.contentHash !== change.contentHash
          : existing.text !== change.text || (existing.note || '') !== change.note)))
    throw new TogetherError('This saved memory changed. Review it before trying again.', 409);
  if (existing) return { data, changed: false };
  if (data.quotes.length + data.photos.length >= 5000) throw new TogetherError('Our collection is full. Please make some room before adding more.', 409);
  const item = { id: change.operationId, date: change.date };
  if (photo) Object.assign(item, { src: `assets/photos/${change.date.slice(0,4)}/${change.date.slice(5,7)}/${change.operationId}.jpg`, caption: change.caption, alt: change.caption || 'A picture of us', contentHash: change.contentHash });
  else Object.assign(item, { text: change.text, ...(change.note ? { note: change.note } : {}) });
  collection.push(item); data.updatedAt = now.toISOString();
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 900000) throw new TogetherError('Our collection needs more storage before adding this memory. Your addition stays on your phone.', 409);
  return { data, changed: true, item };
}
export class GitHubMemoriesStore extends GitHubTogetherStore {
  async read(options) { return checkedMemories(await this.jsonFile('dist/memories.json', options)); }
  async change(input) {
    if (!this.writable) throw new TogetherError('Shared saving needs its connection restored. Your memory stays on this phone.');
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
      const tree = await this.github('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: entries });
      if (!SHA.test(tree.sha)) throw new TogetherError('Our memory could not be saved.');
      const commit = await this.github('/git/commits', 'POST', { message: change.photo ? 'Keep a shared photo from our app' : 'Keep a shared quote from our app', tree: tree.sha, parents: [sha] });
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
