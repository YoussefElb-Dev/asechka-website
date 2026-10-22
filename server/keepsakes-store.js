import { GitHubTogetherStore, TogetherError } from './together-store.js';
import { UUID } from './daily-memory.js';
const SHA = /^[a-f0-9]{40}$/;
const talkingDate = value => value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const invalid = () => { throw new TogetherError('Our little letters couldn’t be read. Nothing has been changed.'); };
export function checkedKeepsakes(value) {
  if (!value || value.version !== 1 || !value.since || !Number.isFinite(Date.parse(value.since.startedAt))
      || !UUID.test(value.since.id || '') || !UUID.test(value.since.revision || '')
      || ['monthlyMessage','yearlyMessage'].some(key => typeof (value.since[key] ?? '') !== 'string' || (value.since[key] || '').length > 2000)
      || value.since.startedTalkingAt !== undefined && !talkingDate(value.since.startedTalkingAt)
      || value.since.timeZone !== 'America/New_York' || !Array.isArray(value.letters) || !Array.isArray(value.things)
      || value.letters.length > 100 || value.things.length > 500) invalid();
  const ids = new Set([value.since.id]);
  for (const [kind, items] of [['Letter', value.letters], ['Thing', value.things]]) for (const item of items) {
    if (!item || !UUID.test(item.id || '') || !UUID.test(item.revision || '') || ids.has(item.id)
        || typeof item.text !== 'string' || !item.text.trim() || item.text.length > (kind === 'Letter' ? 16000 : 2000)
        || kind === 'Letter' && (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160)) invalid();
    ids.add(item.id);
  }
  return structuredClone(value);
}
export function checkedKeepsakeChange(input) {
  if (!input || !['saveSince','saveLetter','saveThing','removeLetter','removeThing'].includes(input.action)
      || !UUID.test(input.operationId || '') || !UUID.test(input.id || '')
      || !(input.expectedRevision === null || UUID.test(input.expectedRevision || '')))
    throw new TogetherError('Open this little note again before changing it.', 400);
  const change = { action: input.action, operationId: input.operationId, id: input.id, expectedRevision: input.expectedRevision };
  if (input.action === 'saveSince') {
    if (typeof input.startedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(input.startedAt) || !Number.isFinite(Date.parse(input.startedAt))
        || ['monthlyMessage','yearlyMessage'].some(key => typeof input[key] !== 'string' || input[key].length > 2000)) throw new TogetherError('Choose a date and keep each anniversary message under 2,000 characters.', 400);
    if (input.startedTalkingAt !== undefined && !talkingDate(input.startedTalkingAt)) throw new TogetherError('Choose a valid date for when we started talking.', 400);
    return { ...change, startedAt: new Date(input.startedAt).toISOString(), monthlyMessage: input.monthlyMessage.trim(), yearlyMessage: input.yearlyMessage.trim(), ...(input.startedTalkingAt === undefined ? {} : { startedTalkingAt: input.startedTalkingAt }) };
  }
  if (input.action.startsWith('save')) {
    const max = input.action.endsWith('Letter') ? 16000 : 2000;
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > max)
      throw new TogetherError(`Write a little message under ${max.toLocaleString('en-US')} characters.`, 400);
    change.text = input.text.trim();
    if (input.action.endsWith('Letter')) {
      if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 160)
        throw new TogetherError('Give this letter a title under 160 characters.', 400);
      change.title = input.title.trim();
    }
  }
  return change;
}
export function changeKeepsakes(base, change, now = new Date()) {
  const data = checkedKeepsakes(base), key = change.action.endsWith('Letter') ? 'letters' : 'things';
  const index = data[key].findIndex(item => item.id === change.id), current = data[key][index];
  const conflict = () => { throw new TogetherError('This note changed on the other screen. Keep your words, close the editor, and open the latest version before saving.', 409); };
  if (change.action === 'saveSince') {
    if (data.since.id !== change.id) conflict();
    if (data.since.revision === change.operationId) {
      if (['startedAt','monthlyMessage','yearlyMessage', ...(change.startedTalkingAt === undefined ? [] : ['startedTalkingAt'])].some(key => data.since[key] !== change[key])) conflict();
      return { data, changed: false };
    }
    if (data.since.revision !== change.expectedRevision) conflict();
    data.since = { ...data.since, startedAt: change.startedAt, monthlyMessage: change.monthlyMessage, yearlyMessage: change.yearlyMessage, revision: change.operationId, ...(change.startedTalkingAt === undefined ? {} : { startedTalkingAt: change.startedTalkingAt }) };
    data.updatedAt = now.toISOString();
    if (Buffer.byteLength(JSON.stringify(data)) > 500000) throw new TogetherError('Our little collection is full. Your draft is still here.', 409);
    return { data, changed: true };
  }
  if (current?.revision === change.operationId && change.action.startsWith('save')) {
    if (current.text !== change.text || key === 'letters' && current.title !== change.title) conflict();
    return { data, changed: false };
  }
  if (change.action.startsWith('remove') && !current) return { data, changed: false };
  if ((current?.revision ?? null) !== change.expectedRevision) conflict();
  if (change.action.startsWith('remove')) data[key].splice(index, 1);
  else {
    if (!current && (data[key].length >= (key === 'letters' ? 100 : 500) || [data.since, ...data.letters, ...data.things].some(item => item.id === change.id)))
      throw new TogetherError('Make a little room in this collection before adding more.', 400);
    const item = { ...current, id: change.id, revision: change.operationId, text: change.text, ...(key === 'letters' ? { title: change.title } : {}) };
    if (current) data[key][index] = item; else data[key].push(item);
  }
  data.updatedAt = now.toISOString();
  if (Buffer.byteLength(JSON.stringify(data)) > 500000) throw new TogetherError('Our little collection is full. Your draft is still here.', 409);
  return { data, changed: true };
}
export class GitHubKeepsakesStore extends GitHubTogetherStore {
  async read(options) { return checkedKeepsakes(await this.jsonFile('dist/keepsakes.json', options)); }
  async change(input) {
    if (!this.writable) throw new TogetherError('Shared saving needs its connection restored. Your draft is still here.');
    const change = checkedKeepsakeChange(input);
    for (let attempt = 0; attempt < 3; attempt++) {
      const ref = await this.github('/git/ref/heads/main'), sha = ref.object?.sha;
      if (!SHA.test(sha)) throw new TogetherError('Our shared connection needs a moment.');
      const update = changeKeepsakes(await this.read({ ref: sha, fresh: true }), change, new Date(this.now()));
      if (!update.changed) return update.data;
      const parent = await this.github(`/git/commits/${sha}`);
      if (!SHA.test(parent.tree?.sha)) throw new TogetherError('Our shared connection needs a moment.');
      const tree = await this.github('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: [{ path: 'dist/keepsakes.json', mode: '100644', type: 'blob', content: JSON.stringify(update.data, null, 2) + '\n' }] });
      if (!SHA.test(tree.sha)) throw new TogetherError('This little note couldn’t be saved.');
      const commit = await this.github('/git/commits', 'POST', { message: change.action.startsWith('remove') ? 'Remove a little keepsake' : 'Keep a little letter or loving detail', tree: tree.sha, parents: [sha] });
      if (!SHA.test(commit.sha)) throw new TogetherError('This little note couldn’t be saved.');
      try {
        await this.github('/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
        this.cache.clear(); return update.data;
      } catch (error) {
        this.cache.clear(); if (!(error instanceof TogetherError) || error.status !== 409 || attempt === 2) throw error;
      }
    }
  }
}
