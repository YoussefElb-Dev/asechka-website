import { preparePhoto } from './collection-editor.js';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const kinds = { Victory: 'victories', Recipe: 'recipes', Joke: 'jokes' };
const names = { Victory: 'little victory', Recipe: 'recipe', Joke: 'inside joke' };
const people = { me: 'Me', asechka: 'Asechka', us: 'Both of us' };
let data, writable = false, loading = false, generation = 0, recipeFilter = 'all';
function make(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(text, className, action) { const node = make('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node; }
function checked(value) {
  if (value?.version !== 1 || !Object.values(kinds).every(key => Array.isArray(value[key]) && value[key].every(item => typeof item.id === 'string' && typeof item.revision === 'string' && typeof item.title === 'string'))) throw Error('Our little book needs a moment to open.');
  return value;
}
function status(text = '') { $('[data-book-status]').textContent = text; }
async function request(options = {}) {
  const response = await fetch('/api/journal', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(40000), ...options });
  let value; try { value = await response.json(); } catch { throw Error('Our connection needs a moment. Your draft is still here.'); }
  if (response.status === 401) throw Error('Unlock our little door in another tab, then try again. Your draft is still here.');
  if (!response.ok) throw Error(value.error || 'This entry couldn’t be saved. Your draft is still here.');
  return checked(value);
}
function chapter(key, focus = false) {
  if (!Object.values(kinds).includes(key)) key = 'victories';
  for (const tab of $$('[data-chapter]')) { const active = tab.dataset.chapter === key; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; if (active && focus) tab.focus(); }
  for (const panel of $$('.journal-panel')) panel.hidden = panel.id !== key;
}
for (const tab of $$('[data-chapter]')) {
  tab.addEventListener('click', () => { chapter(tab.dataset.chapter); history.replaceState(null, '', `#${tab.dataset.chapter}`); });
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const tabs = $$('[data-chapter]'), index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    chapter(tabs[next].dataset.chapter, true); history.replaceState(null, '', `#${tabs[next].dataset.chapter}`);
  });
}
chapter(location.hash.slice(1)); window.addEventListener('hashchange', () => chapter(location.hash.slice(1)));
function dateLabel(value) { return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(Date.parse(value)); }
function today() { const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const get = key => parts.find(part => part.type === key).value; return `${get('year')}-${get('month')}-${get('day')}`; }
const photoURL = id => `/api/journal?photo=${encodeURIComponent(id)}`;
function photo(item, className = 'recipe-photo') {
  const image = make('img', className); image.src = photoURL(item.photoId); image.alt = `Our picture of ${item.title}`; image.loading = 'lazy';
  image.addEventListener('error', () => { image.hidden = true; image.after(make('p', 'book-help', 'Our picture couldn’t load. Reopen the recipe to try again.')); }, { once: true }); return image;
}
function ratings(item) {
  const wrap = make('div', 'recipe-ratings');
  for (const who of ['me', 'asechka']) { const rating = item.ratings[who]; wrap.append(make('span', '', `${people[who]} · ${rating === null ? 'not rated yet' : `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} · ${rating}/5`}`)); }
  return wrap;
}
function actions(kind, item) {
  const wrap = make('div', 'entry-actions');
  for (const remove of [false, true]) {
    const node = button(remove ? 'Remove' : 'Edit', '', () => edit(kind, item, node, remove));
    node.disabled = !writable; node.setAttribute('aria-label', `${remove ? 'Remove' : 'Edit'} ${names[kind]}: ${item.title}`); wrap.append(node);
  }
  return wrap;
}
function render() {
  if (!data) return;
  $$('[data-add]').forEach(node => { node.disabled = !writable; });
  for (const [kind, key] of Object.entries(kinds)) {
    $(`[data-count="${key}"]`).textContent = data[key].length;
    const grid = $(`[data-grid="${key}"]`); grid.replaceChildren(); grid.setAttribute('aria-busy', 'false');
    $(`[data-empty="${key}"]`).hidden = data[key].length > 0;
    const query = $('#joke-search').value.trim().toLocaleLowerCase();
    const items = [...data[key]].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).filter(item => {
      if (kind === 'Recipe') return recipeFilter === 'all' || item.tried === (recipeFilter === 'tried');
      if (kind === 'Joke') return !query || `${item.title} ${item.meaning} ${item.story}`.toLocaleLowerCase().includes(query);
      return true;
    });
    for (const item of items) {
      const card = make('article', 'journal-card'), copy = make('div', 'journal-card-copy');
      if (kind === 'Victory') {
        const top = make('div', 'victory-top'), star = make('span', 'victory-star', '✧'); star.setAttribute('aria-hidden', 'true');
        top.append(make('span', 'entry-chip', `Proud of · ${people[item.who]}`), star); copy.append(top, make('h3', '', item.title));
        if (item.note) copy.append(make('p', '', item.note));
        const time = make('time', 'entry-date', dateLabel(item.date)); time.dateTime = item.date; copy.append(time);
      } else if (kind === 'Recipe') {
        if (item.photoId) card.append(photo(item));
        else { const placeholder = make('div', 'recipe-photo-placeholder'); placeholder.setAttribute('aria-hidden', 'true'); placeholder.append(make('span', '', 'two plates, please.')); card.append(placeholder); }
        copy.append(make('span', 'entry-chip', item.tried ? 'We tried it ♡' : 'On our kitchen wishlist'));
        const title = make('h3'), open = button(item.title, 'recipe-open', () => readRecipe(item, open)); open.setAttribute('aria-label', `Open recipe: ${item.title}`); title.append(open); copy.append(title);
        if (item.note) copy.append(make('p', '', item.note));
        if (item.tried) copy.append(ratings(item));
        else copy.append(make('p', 'book-help', 'A little something to make together.'));
      } else {
        copy.append(make('span', 'dictionary-word', 'IN OUR DICTIONARY'), make('h3', '', item.title), make('p', 'joke-meaning', item.meaning));
        if (item.story) copy.append(make('p', 'joke-story', item.story));
      }
      copy.append(actions(kind, item)); card.append(copy); grid.append(card);
    }
    if (key === 'recipes') $('[data-recipe-empty]').hidden = !data.recipes.length || items.length > 0;
    if (key === 'jokes') $('[data-joke-empty]').hidden = !data.jokes.length || items.length > 0;
  }
}
async function refresh() {
  if (loading || document.hidden) return;
  loading = true; const before = generation;
  try {
    const next = await request(); if (before !== generation) return;
    const changed = JSON.stringify(next) !== JSON.stringify(data); data = next; writable = next.writable === true;
    if (changed) render(); status(writable ? '' : 'Your book is here to read. Shared editing needs its connection restored.'); $('[data-book-retry]').hidden = writable;
  } catch (error) {
    if (before !== generation) return;
    if (!data) {
      try { const response = await fetch('/journal.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) }); if (!response.ok) throw Error(); data = checked(await response.json()); writable = false; render(); } catch { /* Keep the retry visible if the fallback is also unavailable. */ }
    }
    status(data ? 'Showing the book already here. Reconnecting to shared saving…' : error.message); $('[data-book-retry]').hidden = false;
  } finally { loading = false; }
}
function showModal(dialog, opener) {
  const close = button('×', 'book-modal-close', () => dialog.close()); close.setAttribute('aria-label', 'Close'); dialog.prepend(close);
  document.body.append(dialog); document.body.classList.add('book-dialog-open');
  dialog.addEventListener('close', () => { dialog.remove(); document.body.classList.remove('book-dialog-open'); (opener?.isConnected ? opener : $('[data-chapter][aria-selected="true"]'))?.focus({ preventScroll: true }); }, { once: true });
  dialog.addEventListener('click', event => { if (event.target === dialog && !dialog.querySelector('fieldset')?.disabled) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  dialog.showModal(); return close;
}
function readRecipe(item, opener) {
  const dialog = make('dialog', 'book-modal'), heading = make('h2', '', item.title); heading.id = 'book-reading-title'; dialog.setAttribute('aria-labelledby', heading.id);
  const content = make('div', 'book-recipe-body'); content.append(make('span', 'entry-chip', item.tried ? 'We tried it ♡' : 'On our kitchen wishlist'));
  if (item.photoId) content.append(photo(item));
  for (const [key, label, tag] of [['ingredients', 'Ingredients', 'ul'], ['steps', 'How we make it', 'ol']]) {
    content.append(make('h3', '', label)); const lines = item[key].split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) content.append(make('p', '', 'A little space to fill in when we’re ready.'));
    else { const list = make(tag); for (const line of lines) list.append(make('li', '', line)); content.append(list); }
  }
  if (item.note) content.append(make('h3', '', 'Our little notes'), make('p', '', item.note));
  if (item.tried) content.append(make('h3', '', 'Our verdicts'), ratings(item));
  dialog.append(make('p', 'eyebrow', 'FROM OUR RECIPE BOOK FOR TWO'), heading, content); showModal(dialog, opener);
}
function field(parent, name, labelText, { type = 'text', max = 140, rows = 3, value = '', required = false, options, placeholder = '' } = {}) {
  const label = make('label', 'book-field'); label.append(make('span', '', labelText)); const input = make(options ? 'select' : type === 'textarea' ? 'textarea' : 'input');
  input.name = name; input.required = required;
  if (options) for (const [value, text] of options) { const option = make('option', '', text); option.value = value; input.append(option); }
  else if (type === 'textarea') { input.rows = rows; input.maxLength = max; input.placeholder = placeholder; }
  else { input.type = type; if (type === 'text') { input.maxLength = max; input.placeholder = placeholder; } }
  input.value = value; label.append(input); parent.append(label); return input;
}
function edit(kind, original, opener, remove = false) {
  if (!writable) return;
  const item = original ? structuredClone(original) : null, dialog = make('dialog', 'book-modal'), form = make('form'), fieldset = make('fieldset'), heading = make('h2', '', remove ? 'Keep it, or let it go?' : `${item ? 'Edit' : 'Add'} ${kind === 'Joke' ? 'an' : 'a'} ${names[kind]}.`);
  heading.id = 'book-editing-title'; dialog.setAttribute('aria-labelledby', heading.id); form.append(make('p', 'eyebrow', 'IN OUR OWN WORDS'), heading, fieldset);
  const controls = {}; let chosenPhoto, preparing = false, photoVersion = 0, photoInput, preview, removePhoto, photoNotice;
  if (remove) fieldset.append(make('p', 'book-help', 'Remove this entry from our shared little book?'), make('p', 'book-remove-copy', item.title));
  else {
    controls.title = field(fieldset, 'title', kind === 'Victory' ? 'What happened?' : kind === 'Recipe' ? 'Our dish' : 'Our word or phrase', { value: item?.title || '', max: kind === 'Joke' ? 160 : 140, required: true });
    if (kind === 'Victory') {
      const row = make('div', 'book-row'); fieldset.append(row);
      controls.who = field(row, 'who', 'Proud of', { value: item?.who || 'asechka', options: Object.entries(people) });
      controls.date = field(row, 'date', 'The day', { type: 'date', value: item?.date || today(), required: true });
      controls.note = field(fieldset, 'note', 'Why I’m proud · optional', { type: 'textarea', value: item?.note || '', max: 3000, rows: 5 });
    } else if (kind === 'Joke') {
      controls.meaning = field(fieldset, 'meaning', 'What it means to us', { type: 'textarea', value: item?.meaning || '', max: 3000, required: true });
      controls.story = field(fieldset, 'story', 'How it started · optional', { type: 'textarea', value: item?.story || '', max: 3000, rows: 4 });
    } else {
      controls.ingredients = field(fieldset, 'ingredients', 'Ingredients · optional', { type: 'textarea', value: item?.ingredients || '', max: 6000, rows: 5, placeholder: 'One ingredient per line…' });
      controls.steps = field(fieldset, 'steps', 'How we make it · optional', { type: 'textarea', value: item?.steps || '', max: 12000, rows: 6, placeholder: 'One step per line…' });
      controls.note = field(fieldset, 'note', 'Our little notes · optional', { type: 'textarea', value: item?.note || '', max: 2000, placeholder: 'What we’d try, change, or remember…' });
      const triedLabel = make('label', 'book-tried'), tried = make('input'); tried.type = 'checkbox'; tried.name = 'tried'; tried.checked = item?.tried || false; triedLabel.append(tried, make('span', '', 'We’ve tried this one ♡')); fieldset.append(triedLabel); controls.tried = tried;
      const row = make('div', 'book-row'); fieldset.append(row); const options = [['', 'Not rated yet'], ...[1, 2, 3, 4, 5].map(value => [String(value), `${'★'.repeat(value)} · ${value}/5`])];
      controls.me = field(row, 'me', 'My rating', { value: item?.ratings.me ?? '', options }); controls.asechka = field(row, 'asechka', 'Asechka’s rating', { value: item?.ratings.asechka ?? '', options });
      const syncRatings = () => { row.hidden = !tried.checked; controls.me.disabled = controls.asechka.disabled = !tried.checked; };
      tried.addEventListener('change', syncRatings); syncRatings();
      photoInput = field(fieldset, 'photo', 'A picture of our dish · optional', { type: 'file' }); photoInput.accept = 'image/jpeg,image/png,image/webp';
      preview = make('img', 'book-photo-preview'); preview.alt = 'Picture for our recipe'; preview.hidden = !item?.photoId; if (item?.photoId) preview.src = photoURL(item.photoId); fieldset.append(preview);
      const undoPhoto = button('Undo new photo', 'journal-retry', () => { photoVersion++; chosenPhoto = undefined; preparing = false; photoInput.value = ''; preview.hidden = !item?.photoId || removePhoto?.checked; if (item?.photoId) preview.src = photoURL(item.photoId); undoPhoto.hidden = true; photoNotice.textContent = ''; }); undoPhoto.hidden = true; fieldset.append(undoPhoto);
      if (item?.photoId) { const label = make('label', 'book-photo-remove'); removePhoto = make('input'); removePhoto.type = 'checkbox'; label.append(removePhoto, make('span', '', 'Remove the current picture')); fieldset.append(label); removePhoto.addEventListener('change', () => { preview.hidden = removePhoto.checked; if (removePhoto.checked) { photoVersion++; chosenPhoto = undefined; preparing = false; photoInput.value = ''; undoPhoto.hidden = true; photoNotice.textContent = ''; } else preview.src = photoURL(item.photoId); }); }
      photoNotice = make('p', 'book-help'); photoNotice.setAttribute('role', 'status'); fieldset.append(photoNotice);
      photoInput.addEventListener('change', async () => {
        const version = ++photoVersion, file = photoInput.files?.[0]; if (!file) return;
        chosenPhoto = undefined; preparing = true; photoNotice.textContent = 'Getting our picture ready…';
        try { const picture = await preparePhoto(file); if (version !== photoVersion || !dialog.isConnected) return; chosenPhoto = picture; preview.src = picture; preview.hidden = false; if (removePhoto) removePhoto.checked = false; undoPhoto.hidden = false; photoNotice.textContent = 'Our picture is ready. Save the recipe to keep it. ♡'; }
        catch (error) { if (version === photoVersion) { photoNotice.textContent = error.message; photoInput.value = ''; preview.hidden = !item?.photoId || removePhoto?.checked; if (item?.photoId) preview.src = photoURL(item.photoId); undoPhoto.hidden = true; } }
        finally { if (version === photoVersion) preparing = false; }
      });
    }
  }
  const actions = make('div', 'book-form-actions'), cancel = button(remove ? 'Keep it' : 'Cancel', 'button button-outline', () => dialog.close()), save = make('button', 'button button-primary', remove ? 'Remove it' : 'Save for both of us ♡'); save.type = 'submit'; actions.append(cancel, save); fieldset.append(actions);
  const notice = make('p', 'book-edit-status'); notice.hidden = true; notice.setAttribute('role', 'alert'); form.append(notice); dialog.append(form);
  const close = showModal(dialog, opener); let busy = false, signature, operationId; const id = item?.id || crypto.randomUUID();
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; if (preparing) { notice.textContent = 'Our picture is still getting ready. Give it a moment, then save.'; notice.hidden = false; return; }
    const payload = { action: `${remove ? 'remove' : 'save'}${kind}`, id, expectedRevision: item?.revision || null };
    if (!remove) {
      for (const [key, input] of Object.entries(controls)) if (!['tried', 'me', 'asechka'].includes(key)) payload[key] = input.value;
      if (kind === 'Recipe') { payload.tried = controls.tried.checked; payload.ratings = Object.fromEntries(['me', 'asechka'].map(who => [who, payload.tried && controls[who].value ? Number(controls[who].value) : null])); if (chosenPhoto) payload.photo = chosenPhoto; else if (removePhoto?.checked) payload.removePhoto = true; }
    }
    const next = JSON.stringify(payload); if (next !== signature) { signature = next; operationId = crypto.randomUUID(); }
    busy = true; fieldset.disabled = true; close.disabled = true; save.textContent = remove ? 'Removing…' : 'Saving…'; notice.hidden = true; generation++;
    try { const saved = await request({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Asechka-Journal': '1' }, body: JSON.stringify({ ...payload, operationId }) }); generation++; data = saved; writable = saved.writable === true; render(); status(remove ? 'Removed from our little book.' : 'Saved for both of you. ♡'); dialog.close(); }
    catch (error) { notice.textContent = ['TypeError', 'TimeoutError'].includes(error.name) ? 'Our connection needs a moment. Your draft is still here; try saving again.' : error.message; if (notice.textContent.includes('another tab')) { const link = make('a', '', 'Unlock in another tab ↗'); link.href = '/login'; link.target = '_blank'; link.rel = 'noopener'; notice.append(link); } notice.hidden = false; }
    finally { busy = false; fieldset.disabled = false; close.disabled = false; save.textContent = remove ? 'Remove it' : 'Save for both of us ♡'; if (kind === 'Recipe' && !remove) controls.me.disabled = controls.asechka.disabled = !controls.tried.checked; }
  });
  (remove ? cancel : controls.title).focus();
}
$$('[data-add]').forEach(node => node.addEventListener('click', () => edit(node.dataset.add, null, node)));
$$('[data-recipe-filter]').forEach(node => node.addEventListener('click', () => { recipeFilter = node.dataset.recipeFilter; $$('[data-recipe-filter]').forEach(button => button.setAttribute('aria-pressed', String(button === node))); render(); }));
$('#joke-search').addEventListener('input', render); $('[data-book-retry]').addEventListener('click', refresh);
refresh(); setInterval(refresh, 60000); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
