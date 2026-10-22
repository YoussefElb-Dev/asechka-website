import { GitHubTogetherStore, TogetherError, checkedPhoto } from './together-store.js';
import { UUID } from './daily-memory.js';
import { readFile } from 'node:fs/promises';
const SHA = /^[a-f0-9]{40}$/;
const kinds = { Victory: 'victories', Recipe: 'recipes', Joke: 'jokes' };
const fields = { Victory: { title: 140, note: 3000 }, Recipe: { title: 140, ingredients: 6000, steps: 12000, note: 2000 }, Joke: { title: 160, meaning: 3000, story: 3000 } };
export const calendarDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const fail = (message = 'Our little book couldn’t be read. Nothing has been changed.', status = 503) => { throw new TogetherError(message, status); };
const rating = value => value === null || Number.isInteger(value) && value >= 1 && value <= 5;
function validFields(item, kind) {
  if (!item || Object.entries(fields[kind]).some(([key, max]) => typeof item[key] !== 'string' || item[key].length > max) || !item.title.trim()) return false;
  if (kind === 'Victory') return calendarDate(item.date) && ['me', 'asechka', 'us'].includes(item.who);
  if (kind === 'Joke') return !!item.meaning.trim();
  return typeof item.tried === 'boolean' && item.ratings && rating(item.ratings.me) && rating(item.ratings.asechka) && (item.tried || item.ratings.me === null && item.ratings.asechka === null);
}
export function checkedJournal(value) {
  if (!value || value.version !== 1) fail();
  const ids = new Set();
  for (const [kind, key] of Object.entries(kinds)) {
    if (!Array.isArray(value[key]) || value[key].length > 200) fail();
    for (const item of value[key]) {
      if (!validFields(item, kind) || !UUID.test(item.id || '') || !UUID.test(item.revision || '') || ids.has(item.id) || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))
          || kind === 'Recipe' && !(item.photoId === null || UUID.test(item.photoId || ''))) fail();
      ids.add(item.id);
    }
  }
  if (Buffer.byteLength(JSON.stringify(value)) > 1500000) fail();
  return structuredClone(value);
}
export function checkedJournalChange(input) {
  const match = /^(save|remove)(Victory|Recipe|Joke)$/.exec(input?.action || '');
  if (!match || !UUID.test(input.id || '') || !UUID.test(input.operationId || '') || !(input.expectedRevision === null || UUID.test(input.expectedRevision || ''))) fail('Open this entry again before changing it.', 400);
  const [, verb, kind] = match, change = { action: input.action, kind, key: kinds[kind], id: input.id, operationId: input.operationId, expectedRevision: input.expectedRevision };
  if (verb === 'remove') return change;
  if (!validFields(input, kind)) fail('Check the title and details. Ratings are from 1 to 5, after you’ve tried the recipe.', 400);
  for (const key of Object.keys(fields[kind])) change[key] = input[key].trim();
  if (kind === 'Victory') Object.assign(change, { date: input.date, who: input.who });
  if (kind === 'Recipe') {
    if (input.removePhoto !== undefined && typeof input.removePhoto !== 'boolean' || input.removePhoto && input.photo !== undefined) fail('Choose a new photo or remove the old one, then try again.', 400);
    Object.assign(change, { tried: input.tried, ratings: { me: input.ratings.me, asechka: input.ratings.asechka }, removePhoto: input.removePhoto === true });
    if (input.photo !== undefined) change.photo = checkedPhoto(input.photo);
  }
  return change;
}
export function changeJournal(base, change, now = new Date()) {
  const data = checkedJournal(base), index = data[change.key].findIndex(item => item.id === change.id), current = data[change.key][index];
  const conflict = () => fail('This entry changed on the other screen. Your draft is still here. Close it and open the latest entry before saving.', 409);
  if (change.action.startsWith('remove') && !current) return { data, changed: false };
  const values = Object.fromEntries(Object.keys(fields[change.kind]).map(key => [key, change[key]]));
  if (change.kind === 'Victory') Object.assign(values, { date: change.date, who: change.who });
  if (change.kind === 'Recipe') Object.assign(values, { tried: change.tried, ratings: change.ratings, photoId: change.photo ? change.operationId : change.removePhoto ? null : current?.photoId || null });
  if (current?.revision === change.operationId && change.action.startsWith('save')) {
    if (Object.keys(values).some(key => JSON.stringify(values[key]) !== JSON.stringify(current[key]))) conflict();
    return { data, changed: false };
  }
  if ((current?.revision ?? null) !== change.expectedRevision) conflict();
  if (change.action.startsWith('remove')) data[change.key].splice(index, 1);
  else {
    if (!current && (data[change.key].length >= 200 || Object.values(kinds).some(key => data[key].some(item => item.id === change.id)))) fail('Make a little room in this collection before adding more.', 400);
    const item = { ...current, ...values, id: change.id, revision: change.operationId, createdAt: current?.createdAt || now.toISOString() };
    if (current) data[change.key][index] = item; else data[change.key].push(item);
  }
  data.updatedAt = now.toISOString();
  if (Buffer.byteLength(JSON.stringify(data)) > 1500000) fail('Our little book is full. Your draft is still here.', 409);
  return { data: checkedJournal(data), changed: true };
}
export class GitHubJournalStore extends GitHubTogetherStore {
  async read(options) { return checkedJournal(await this.jsonFile('dist/journal.json', options)); }
  async photo(id) {
    if (!UUID.test(id || '')) fail('This recipe picture couldn’t be found.', 404);
    const data = await this.read({ fresh: true });
    if (!data.recipes.some(item => item.photoId === id)) fail('This recipe picture couldn’t be found.', 404);
    const path = `dist/assets/recipes/${id}.jpg`;
    const cached = this.photos.get(id); if (cached) return cached;
    const bytes = this.writable ? await this.file(path) : await readFile(new URL(`../${path}`, import.meta.url));
    if (!bytes || bytes.length > 320000) fail('This recipe picture couldn’t be read.');
    if (this.photos.size >= 10) this.photos.delete(this.photos.keys().next().value);
    this.photos.set(id, bytes); return bytes;
  }
  async change(input) {
    if (!this.writable) fail('Shared saving needs its connection restored. Your draft is still here.');
    const change = checkedJournalChange(input); let blob;
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await this.github('/git/ref/heads/main'), sha = ref.object?.sha;
      if (!SHA.test(sha)) fail();
      const base = await this.read({ ref: sha, fresh: true }), update = changeJournal(base, change, new Date(this.now()));
      if (!update.changed) return update.data;
      const parent = await this.github(`/git/commits/${sha}`); if (!SHA.test(parent.tree?.sha)) fail();
      const entries = [{ path: 'dist/journal.json', mode: '100644', type: 'blob', content: JSON.stringify(update.data, null, 2) + '\n' }];
      if (change.photo) {
        blob ||= await this.github('/git/blobs', 'POST', { encoding: 'base64', content: change.photo.toString('base64') });
        if (!SHA.test(blob.sha)) fail();
        entries.push({ path: `dist/assets/recipes/${change.operationId}.jpg`, mode: '100644', type: 'blob', sha: blob.sha });
      }
      const previousPhoto = change.kind === 'Recipe' && base.recipes.find(item => item.id === change.id)?.photoId;
      if (previousPhoto && (change.action.startsWith('remove') || change.removePhoto || change.photo)) entries.push({ path: `dist/assets/recipes/${previousPhoto}.jpg`, mode: '100644', type: 'blob', sha: null });
      const tree = await this.github('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: entries }); if (!SHA.test(tree.sha)) fail();
      const commit = await this.github('/git/commits', 'POST', { message: change.action.startsWith('remove') ? 'Remove an entry from our little book' : 'Save a little victory, recipe or inside joke', tree: tree.sha, parents: [sha] }); if (!SHA.test(commit.sha)) fail();
      try {
        await this.github('/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
        this.cache.clear(); this.photos.clear(); return update.data;
      } catch (error) { this.cache.clear(); if (!(error instanceof TogetherError) || error.status !== 409 || attempt === 2) throw error; }
    }
  }
}
