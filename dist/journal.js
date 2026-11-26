const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let data, writable = false, loading = false, generation = 0;

function make(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(text, className, action) { const node = make('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node; }
function checked(value) {
  if (value?.version !== 1 || !Array.isArray(value.jokes) || !value.jokes.every(item => typeof item.id === 'string' && typeof item.revision === 'string' && typeof item.title === 'string')) {
    throw Error('Our secret vocab needs a moment to open.');
  }
  return value;
}
function status(text = '') { const el = $('[data-book-status]'); if (el) el.textContent = text; }
async function request(options = {}) {
  const response = await fetch('/api/journal', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(40000), ...options });
  let value; try { value = await response.json(); } catch { throw Error('Our connection needs a moment. Your draft is still here.'); }
  if (response.status === 401) throw Error('Unlock our little door in another tab, then try again. Your draft is still here.');
  if (!response.ok) throw Error(value.error || 'This entry couldn’t be saved. Your draft is still here.');
  return checked(value);
}
function actions(item) {
  const wrap = make('div', 'entry-actions');
  for (const remove of [false, true]) {
    const node = button(remove ? 'Remove' : 'Edit', '', () => edit(item, node, remove));
    node.disabled = !writable; node.setAttribute('aria-label', `${remove ? 'Remove' : 'Edit'} inside joke: ${item.title}`); wrap.append(node);
  }
  return wrap;
}
function render() {
  if (!data) return;
  $$('[data-add]').forEach(node => { node.disabled = !writable; });
  const countEl = $('[data-count="jokes"]'); if (countEl) countEl.textContent = data.jokes.length;
  const grid = $('[data-grid="jokes"]'); if (!grid) return;
  grid.replaceChildren(); grid.setAttribute('aria-busy', 'false');
  const empty = $('[data-empty="jokes"]'); if (empty) empty.hidden = data.jokes.length > 0;
  const query = ($('#joke-search')?.value || '').trim().toLocaleLowerCase();
  const items = [...data.jokes]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter(item => !query || `${item.title} ${item.meaning} ${item.story}`.toLocaleLowerCase().includes(query));
  for (const item of items) {
    const card = make('article', 'journal-card'), copy = make('div', 'journal-card-copy');
    copy.append(make('span', 'dictionary-word', 'IN OUR DICTIONARY'), make('h3', '', item.title), make('p', 'joke-meaning', item.meaning));
    if (item.story) copy.append(make('p', 'joke-story', item.story));
    copy.append(actions(item)); card.append(copy); grid.append(card);
  }
  const filterEmpty = $('[data-joke-empty]'); if (filterEmpty) filterEmpty.hidden = !data.jokes.length || items.length > 0;
}
async function refresh() {
  if (loading || document.hidden) return;
  loading = true; const before = generation;
  try {
    const next = await request(); if (before !== generation) return;
    const changed = JSON.stringify(next) !== JSON.stringify(data); data = next; writable = next.writable === true;
    if (changed) render(); status(writable ? '' : 'Your secret vocab is here to read. Shared editing needs its connection restored.');
    const retry = $('[data-book-retry]'); if (retry) retry.hidden = writable;
  } catch (error) {
    if (before !== generation) return;
    if (!data) {
      try { const response = await fetch('/journal.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) }); if (!response.ok) throw Error(); data = checked(await response.json()); writable = false; render(); } catch {}
    }
    status(data ? 'Showing the words already here. Reconnecting to shared saving…' : error.message);
    const retry = $('[data-book-retry]'); if (retry) retry.hidden = false;
  } finally { loading = false; }
}
function showModal(dialog, opener) {
  const close = button('×', 'book-modal-close', () => dialog.close()); close.setAttribute('aria-label', 'Close'); dialog.prepend(close);
  document.body.append(dialog); document.body.classList.add('book-dialog-open');
  dialog.addEventListener('close', () => { dialog.remove(); document.body.classList.remove('book-dialog-open'); opener?.isConnected && opener.focus({ preventScroll: true }); }, { once: true });
  dialog.addEventListener('click', event => { if (event.target === dialog && !dialog.querySelector('fieldset')?.disabled) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  dialog.showModal(); return close;
}
function field(parent, name, labelText, { type = 'text', max = 140, rows = 3, value = '', required = false, placeholder = '' } = {}) {
  const label = make('label', 'book-field'); label.append(make('span', '', labelText)); const input = make(type === 'textarea' ? 'textarea' : 'input');
  input.name = name; input.required = required;
  if (type === 'textarea') { input.rows = rows; input.maxLength = max; input.placeholder = placeholder; }
  else { input.type = type; input.maxLength = max; input.placeholder = placeholder; }
  input.value = value; label.append(input); parent.append(label); return input;
}
function edit(original, opener, remove = false) {
  if (!writable) return;
  const item = original ? structuredClone(original) : null, dialog = make('dialog', 'book-modal'), form = make('form'), fieldset = make('fieldset');
  const heading = make('h2', '', remove ? 'Keep it, or let it go?' : `${item ? 'Edit' : 'Add'} an inside joke.`);
  heading.id = 'book-editing-title'; dialog.setAttribute('aria-labelledby', heading.id); form.append(make('p', 'eyebrow', 'IN OUR OWN WORDS'), heading, fieldset);
  const controls = {};
  if (remove) fieldset.append(make('p', 'book-help', 'Remove this entry from our secret vocab?'), make('p', 'book-remove-copy', item.title));
  else {
    controls.title = field(fieldset, 'title', 'Our word or phrase', { value: item?.title || '', max: 160, required: true });
    controls.meaning = field(fieldset, 'meaning', 'What it means to us', { type: 'textarea', value: item?.meaning || '', max: 3000, required: true });
    controls.story = field(fieldset, 'story', 'How it started · optional', { type: 'textarea', value: item?.story || '', max: 3000, rows: 4 });
  }
  const actionsWrap = make('div', 'book-form-actions'), cancel = button(remove ? 'Keep it' : 'Cancel', 'button button-outline', () => dialog.close()), save = make('button', 'button button-primary', remove ? 'Remove it' : 'Save for both of us ♡'); save.type = 'submit'; actionsWrap.append(cancel, save); fieldset.append(actionsWrap);
  const notice = make('p', 'book-edit-status'); notice.hidden = true; notice.setAttribute('role', 'alert'); form.append(notice); dialog.append(form);
  const close = showModal(dialog, opener); let busy = false, signature, operationId; const id = item?.id || crypto.randomUUID();
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const payload = { action: `${remove ? 'remove' : 'save'}Joke`, id, expectedRevision: item?.revision || null };
    if (!remove) for (const [key, input] of Object.entries(controls)) payload[key] = input.value;
    const next = JSON.stringify(payload); if (next !== signature) { signature = next; operationId = crypto.randomUUID(); }
    busy = true; fieldset.disabled = true; close.disabled = true; save.textContent = remove ? 'Removing…' : 'Saving…'; notice.hidden = true; generation++;
    try {
      const saved = await request({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Asechka-Journal': '1' }, body: JSON.stringify({ ...payload, operationId }) });
      generation++; data = saved; writable = saved.writable === true; render(); status(remove ? 'Removed from our secret vocab.' : 'Saved for both of you. ♡'); dialog.close();
    } catch (error) {
      notice.textContent = ['TypeError', 'TimeoutError'].includes(error.name) ? 'Our connection needs a moment. Your draft is still here; try saving again.' : error.message;
      if (notice.textContent.includes('another tab')) { const link = make('a', '', 'Unlock in another tab ↗'); link.href = '/login'; link.target = '_blank'; link.rel = 'noopener'; notice.append(link); }
      notice.hidden = false;
    } finally { busy = false; fieldset.disabled = false; close.disabled = false; save.textContent = remove ? 'Remove it' : 'Save for both of us ♡'; }
  });
  (remove ? cancel : controls.title).focus();
}
$$('[data-add]').forEach(node => node.addEventListener('click', () => edit(null, node)));
$('#joke-search')?.addEventListener('input', render);
$('[data-book-retry]')?.addEventListener('click', refresh);
refresh(); setInterval(refresh, 60000); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
