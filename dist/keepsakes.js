import { sinceUs, localDateTime, fromLocalDateTime } from './keepsake-time.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
let data, writable = false, managing = false, loading = false, generation = 0;
let opened = [], currentId = null;
let selectedLetterId = null, pickedRandomly = true;
const progressKey = 'asechka-little-things-v1';
try {
  const saved = JSON.parse(localStorage.getItem(progressKey));
  if (Array.isArray(saved?.opened)) opened = saved.opened.filter(id => typeof id === 'string');
  if (typeof saved?.currentId === 'string') currentId = saved.currentId;
} catch { /* Reading the page also works with browser storage disabled. */ }
function keepProgress() {
  try { localStorage.setItem(progressKey, JSON.stringify({ opened, currentId })); } catch { /* Progress is optional. */ }
}
function status(message = '') {
  $$('[data-keepsake-status]').forEach(node => { node.textContent = message; node.hidden = !message; });
}
function checked(value) {
  if (value?.version !== 1 || !value.since || !Number.isFinite(Date.parse(value.since.startedAt)) || value.since.timeZone !== 'America/New_York'
      || !Array.isArray(value.letters) || !Array.isArray(value.things)
      || ![...value.letters, ...value.things].every(item => typeof item.id === 'string' && typeof item.revision === 'string' && typeof item.text === 'string')
      || !value.letters.every(item => typeof item.title === 'string')) throw new Error('Our little notes need a moment to load.');
  return value;
}
async function request(options) {
  const response = await fetch('/api/keepsakes', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(25000), ...options });
  let value;
  try { value = await response.json(); } catch { throw new Error('Our connection needs a moment. Your draft is still here.'); }
  if (response.status === 401) throw new Error('Unlock our little door in another tab, then try again. Your draft is still here.');
  if (!response.ok) throw new Error(value.error || 'This little note couldn’t be saved. Your draft is still here.');
  return checked(value);
}
function setControls() {
  $$('[data-add-keepsake], [data-manage-keepsakes], [data-edit-since]').forEach(button => { button.disabled = !writable; });
  $$('[data-manage-keepsakes]').forEach(button => {
    button.setAttribute('aria-pressed', String(managing)); button.textContent = managing ? 'Done editing' : 'Edit our words';
  });
  $$('.keepsake-management').forEach(node => { node.hidden = !managing; });
}
function clock() {
  if (!data) return;
  const state = sinceUs(data.since);
  $$('[data-elapsed]').forEach(node => { node.textContent = String(state.elapsed[node.dataset.elapsed]).padStart(2, '0'); });
  $$('[data-elapsed-timer]').forEach(node => { node.setAttribute('aria-label', `${state.elapsed.days} days, ${state.elapsed.hours} hours, ${state.elapsed.minutes} minutes and ${state.elapsed.seconds} seconds together.`); });
  $$('[data-since-milestone]').forEach(node => { if (node.textContent !== state.message) node.textContent = state.message; });
  const date = new Intl.DateTimeFormat('en-US', { timeZone: data.since.timeZone, month: 'long', day: 'numeric', year: 'numeric' });
  const put = (selector, text) => { $$(selector).forEach(node => { if (node.textContent !== text) node.textContent = text; }); };
  const start = Date.parse(data.since.startedAt), time = new Intl.DateTimeFormat('en-US', { timeZone: data.since.timeZone, hour: 'numeric', minute: '2-digit' }).format(start);
  const format = options => new Intl.DateTimeFormat('en-US', { timeZone: data.since.timeZone, ...options }).format(start);
  const weekday = format({ weekday: 'long' });
  put('[data-beginning-eyebrow]', `THE ${weekday.toUpperCase()} THAT BECAME OURS`); put('[data-beginning-title]', `From that ${weekday},`);
  $$('[data-start-date]').forEach(node => { node.dateTime = data.since.startedAt; const text = `${date.format(start)} · ${time} Eastern`; if (node.textContent !== text) node.textContent = text; });
  put('[data-note-weekday]', format({ weekday: 'long' }).toLowerCase()); put('[data-note-day]', format({ day: 'numeric' }));
  put('[data-note-month]', format({ month: 'long', year: 'numeric' }).toUpperCase()); put('[data-note-time]', `${time} · EASTERN`);
  $$('[data-beginning-note]').forEach(node => { node.setAttribute('aria-label', `Our beginning: ${date.format(start)}, ${time} Eastern`); });
  put('.anniversary-time', `At our time. ${time} Eastern.`);
  put('[data-month-label]', `OUR ${state.months + 1 === 1 ? 'FIRST' : `NEXT · ${state.months + 1}`} MONTH TOGETHER`);
  put('[data-year-label]', `OUR ${state.years + 1 === 1 ? 'FIRST' : `NEXT · ${state.years + 1}`} YEAR TOGETHER`);
  put('[data-month-date]', date.format(state.nextMonth)); put('[data-year-date]', date.format(state.nextYear));
  for (const [kind, parts] of [['month', state.monthly], ['year', state.yearly]])
    put(`[data-${kind}-countdown]`, `${parts.days} days · ${parts.hours} hours · ${parts.minutes} mins to go`);
}
function showDialog(dialog, opener) {
  document.body.append(dialog); document.body.classList.add('keepsake-dialog-open');
  dialog.addEventListener('close', () => {
    dialog.remove(); document.body.classList.remove('keepsake-dialog-open');
    (opener?.isConnected ? opener : $('[data-manage-keepsakes]') || $('[data-next-thing]'))?.focus({ preventScroll: true });
  }, { once: true });
  dialog.showModal();
}
function readLetter(item, opener) {
  const dialog = element('dialog', 'keepsake-letter-dialog');
  dialog.setAttribute('aria-labelledby', 'reading-letter-title');
  const close = element('button', 'keepsake-modal-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close letter');
  close.addEventListener('click', () => dialog.close());
  const title = element('h2', '', `Open when ${item.title}`); title.id = 'reading-letter-title';
  const loveSeal = element('div', 'letter-love-seal'); loveSeal.setAttribute('aria-hidden', 'true');
  for (const heart of ['♡', '♥', '♡']) loveSeal.append(element('span', '', heart));
  const motion = element('button', 'letter-motion-toggle', 'Pause the hearts'); motion.type = 'button'; motion.setAttribute('aria-pressed', 'false');
  motion.addEventListener('click', () => {
    const paused = dialog.classList.toggle('letter-motion-paused');
    motion.setAttribute('aria-pressed', String(paused)); motion.textContent = paused ? 'Let the hearts float' : 'Pause the hearts';
  });
  dialog.append(close, element('p', 'eyebrow', 'A LITTLE LETTER, JUST FOR YOU'), title, element('div', 'letter-body', item.text), loveSeal, element('p', 'keepsake-read-bottom handwritten', 'kept here, whenever you need it. ♡'), motion);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  showDialog(dialog, opener);
  celebrateLetter(dialog);
}
function celebrateLetter(dialog) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('motion-paused')) return;
  const layer = element('div', 'letter-celebration'); layer.setAttribute('aria-hidden', 'true');
  const colors = ['#819fd7', '#aa91d1', '#c2c9eb', '#8c80bf', '#b0cff0'];
  for (let index = 0; index < 42; index++) {
    const heart = index < 14, particle = element('span', heart ? 'letter-floating-heart' : 'letter-confetti', heart ? (index % 3 ? '♡' : '♥') : '');
    const left = heart ? (index % 2 ? 80 + Math.random() * 18 : 2 + Math.random() * 18) : Math.random() * 100;
    particle.style.setProperty('--left', `${left}%`); particle.style.setProperty('--drift', `${(Math.random() - .5) * 160}px`);
    particle.style.setProperty('--life', `${3.2 + Math.random() * 1.7}s`); particle.style.setProperty('--delay', `${Math.random() * .4}s`);
    particle.style.setProperty('--turn', `${(Math.random() - .5) * 1000}deg`); particle.style.setProperty('--size', `${heart ? 19 + Math.random() * 16 : 5 + Math.random() * 5}px`);
    particle.style.setProperty('--color', colors[index % colors.length]); layer.append(particle);
  }
  dialog.append(layer);
  const cleanup = setTimeout(() => layer.remove(), 5500);
  dialog.addEventListener('close', () => { clearTimeout(cleanup); layer.remove(); }, { once: true });
}
function actions(kind, item) {
  const wrap = element('div', 'keepsake-item-actions');
  for (const [label, remove] of [['Edit', false], ['Remove', true]]) {
    const button = element('button', '', label); button.type = 'button';
    button.setAttribute('aria-label', `${label} ${kind === 'Letter' ? `letter: ${item.title}` : `little thing: ${item.text}`}`);
    button.addEventListener('click', () => edit(kind, item, button, remove)); wrap.append(button);
  }
  return wrap;
}
function renderLetters() {
  const grid = $('[data-letter-grid]'); if (!grid) return;
  grid.replaceChildren(); grid.setAttribute('aria-busy', 'false');
  if (!data.letters.some(item => item.id === selectedLetterId)) {
    selectedLetterId = data.letters[Math.floor(Math.random() * data.letters.length)]?.id || null; pickedRandomly = true;
  }
  const item = data.letters.find(item => item.id === selectedLetterId);
  $('[data-letter-focus]').hidden = !item;
  $('[data-letter-picked]').textContent = pickedRandomly ? 'A little letter found its way to you. ♡' : 'A little letter for the moment you chose. ♡';
  if (item) {
    const card = element('article', 'letter-envelope-wrap'), button = element('button', 'letter-envelope'); button.type = 'button';
    button.setAttribute('aria-label', `Open when ${item.title}`);
    const seal = element('span', 'envelope-seal', '♡'); seal.setAttribute('aria-hidden', 'true');
    button.append(seal, element('span', 'envelope-label', 'OPEN WHEN'), element('span', 'envelope-title', item.title), element('span', 'envelope-prompt', 'a little letter for you  ↗'));
    button.addEventListener('click', () => readLetter(item, button)); card.append(button);
    if (managing && writable) card.append(actions('Letter', item)); grid.append(card);
  }
  const otherLetters = data.letters.filter(letter => letter.id !== selectedLetterId);
  const select = $('[data-other-letters]'), placeholder = element('option', '', 'Choose a different letter…'); placeholder.value = '';
  select.replaceChildren(placeholder, ...otherLetters.map(letter => { const option = element('option', '', `Open when ${letter.title}`); option.value = letter.id; return option; }));
  select.value = ''; $('[data-letter-picker]').hidden = !otherLetters.length;
  $('[data-letter-empty]').hidden = data.letters.length > 0;
}
function renderThing(animate = false) {
  const items = data.things, valid = new Set(items.map(item => item.id));
  opened = [...new Set(opened)].filter(id => valid.has(id));
  if (!opened.includes(currentId)) currentId = opened.at(-1) || null;
  keepProgress();
  const item = items.find(item => item.id === currentId), position = opened.indexOf(currentId);
  $$('[data-thing-text]').forEach(node => {
    node.textContent = item?.text || (items.length ? 'There’s a little something I love about you, waiting here.' : 'A little space for the next thing I love about you.');
    node.classList.remove('just-revealed'); if (animate) { void node.offsetWidth; node.classList.add('just-revealed'); }
  });
  $$('[data-thing-number]').forEach(node => { node.textContent = item ? `LITTLE THING ${String(items.indexOf(item) + 1).padStart(2, '0')}` : 'ONE LITTLE THING AT A TIME'; });
  $$('[data-previous-thing]').forEach(button => { button.hidden = position <= 0; });
  $$('[data-next-thing]').forEach(button => {
    button.disabled = !items.length;
    button.textContent = !item ? 'Open a little thing ♡' : opened.length < items.length || position < opened.length - 1 ? 'One more little thing ♡' : 'Read them again ♡';
  });
  $$('[data-thing-progress]').forEach(node => { node.textContent = items.length ? `${opened.length} of ${items.length} little things opened · and still, there’s more to love.` : 'Add a little thing whenever it comes to mind.'; });
  $$('[data-opened-things]').forEach(list => { list.replaceChildren(...opened.map(id => element('li', '', items.find(item => item.id === id).text))); });
  const list = $('[data-manage-things]');
  if (list) list.replaceChildren(...items.map(item => { const row = element('li'); row.append(element('p', '', item.text), actions('Thing', item)); return row; }));
}
function render() { clock(); setControls(); renderLetters(); renderThing(); }
async function refresh() {
  if (loading || document.hidden) return;
  loading = true; const before = generation;
  try {
    const next = await request(); if (before !== generation) return;
    const changed = JSON.stringify(next) !== JSON.stringify(data);
    data = next; writable = next.writable === true; if (changed) render(); else setControls();
    status(writable ? '' : 'You can read everything here. Shared editing needs its connection restored.');
  } catch (error) {
    if (before !== generation) return;
    if (!data) {
      try {
        const response = await fetch('/keepsakes.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw Error(); data = checked(await response.json()); writable = false; render();
      } catch { $$('[data-letter-grid]').forEach(node => { node.setAttribute('aria-busy', 'false'); }); }
    }
    status(data ? 'Showing the words already here. Reconnecting to shared editing…' : error.message);
  } finally { loading = false; }
}
function edit(kind, original, opener, remove = false) {
  if (!writable) return;
  const item = original ? { ...original } : null;
  const dialog = element('dialog', 'keepsake-editor'); dialog.setAttribute('aria-labelledby', 'editing-keepsake-title');
  const form = element('form'), fieldset = element('fieldset'), heading = element('h2', '', remove ? 'Keep it, or let it go?' : kind === 'Since' ? 'Our little beginning' : `${item ? 'Edit' : 'Add'} ${kind === 'Letter' ? 'a little letter' : 'a little thing'}`);
  heading.id = 'editing-keepsake-title';
  const close = element('button', 'keepsake-modal-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close editor');
  close.addEventListener('click', () => dialog.close());
  form.append(element('p', 'eyebrow', remove ? 'OUR LITTLE COLLECTION' : 'IN YOUR OWN WORDS'), heading, fieldset);
  let title, text, dateInput, monthlyInput, yearlyInput;
  if (remove) fieldset.append(element('p', '', 'Remove this from our shared collection?'), element('div', 'keepsake-remove-copy', kind === 'Letter' ? `Open when ${item.title}\n\n${item.text}` : item.text));
  else if (kind === 'Since') {
    const dateLabel = element('label', '', 'The moment we became us · Eastern time'); dateLabel.htmlFor = 'beginning-date';
    dateInput = element('input'); dateInput.type = 'datetime-local'; dateInput.id = 'beginning-date'; dateInput.required = true; dateInput.step = '60'; dateInput.value = localDateTime(item.startedAt);
    fieldset.append(dateLabel, dateInput, element('p', 'management-hint', 'Anniversaries stay at this Eastern clock time, including daylight saving changes.'));
    for (const [key, labelText] of [['monthlyMessage','On our monthly anniversary'], ['yearlyMessage','On our yearly anniversary']]) {
      const label = element('label', '', labelText); label.htmlFor = key;
      const input = element('textarea'); input.id = key; input.rows = 3; input.maxLength = 2000; input.placeholder = 'Leave blank for the simple milestone message'; input.value = item[key] || '';
      fieldset.append(label, input); if (key === 'monthlyMessage') monthlyInput = input; else yearlyInput = input;
    }
  } else {
    if (kind === 'Letter') {
      const label = element('label', '', 'Open when…'); label.htmlFor = 'keepsake-title';
      title = element('input'); title.id = 'keepsake-title'; title.name = 'title'; title.maxLength = 160; title.required = true; title.value = item?.title || ''; title.placeholder = 'you need a little reminder';
      fieldset.append(label, title);
    }
    const label = element('label', '', kind === 'Letter' ? 'Your letter' : 'The little thing you love'); label.htmlFor = 'keepsake-text';
    text = element('textarea'); text.id = 'keepsake-text'; text.name = 'text'; text.rows = kind === 'Letter' ? 10 : 5; text.maxLength = kind === 'Letter' ? 16000 : 2000; text.required = true; text.value = item?.text || '';
    fieldset.append(label, text);
  }
  const buttons = element('div', 'keepsake-form-actions'), cancel = element('button', '', remove ? 'Keep it' : 'Cancel'), save = element('button', 'keepsake-save', remove ? 'Remove it' : 'Save our words ♡');
  cancel.type = 'button'; save.type = 'submit'; cancel.addEventListener('click', () => dialog.close()); buttons.append(cancel, save); fieldset.append(buttons);
  const notice = element('p', 'keepsake-edit-status'); notice.hidden = true; notice.setAttribute('role', 'alert'); form.append(notice);
  dialog.append(close, form);
  let busy = false, operationId, signature;
  const id = item?.id || crypto.randomUUID();
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    let fields = {};
    try {
      if (kind === 'Since') fields = { startedAt: fromLocalDateTime(dateInput.value), monthlyMessage: monthlyInput.value, yearlyMessage: yearlyInput.value };
      else if (!remove) fields = { text: text.value, ...(title ? { title: title.value } : {}) };
    } catch (error) { notice.textContent = error.message; notice.hidden = false; return; }
    const payload = { action: `${remove ? 'remove' : 'save'}${kind}`, id, expectedRevision: item?.revision || null, ...fields };
    const nextSignature = JSON.stringify(payload); if (signature !== nextSignature) { signature = nextSignature; operationId = crypto.randomUUID(); }
    busy = true; fieldset.disabled = true; close.disabled = true; save.textContent = remove ? 'Removing…' : 'Saving…'; notice.hidden = true;
    generation++;
    try {
      const saved = await request({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Asechka-Keepsakes': '1' }, body: JSON.stringify({ ...payload, operationId }) });
      generation++; data = saved; writable = saved.writable === true;
      if (kind === 'Letter' && !remove) { selectedLetterId = id; pickedRandomly = false; }
      render(); status(remove ? 'Removed from our little collection.' : 'Your words are saved for both of you. ♡'); dialog.close();
    } catch (error) {
      notice.textContent = error.name === 'TimeoutError' || error.name === 'TypeError' ? 'Our connection needs a moment. Your draft is still here; try saving again.' : error.message;
      if (notice.textContent.includes('another tab')) {
        const link = element('a', '', ' Unlock in a new tab ↗'); link.href = '/login'; link.target = '_blank'; link.rel = 'noopener'; notice.append(link);
      }
      notice.hidden = false;
    } finally { busy = false; fieldset.disabled = false; close.disabled = false; save.textContent = remove ? 'Remove it' : 'Save our words ♡'; }
  });
  showDialog(dialog, opener); (remove ? cancel : dateInput || title || text).focus();
}
$$('[data-next-thing]').forEach(button => button.addEventListener('click', () => {
  if (!data?.things.length) return;
  const position = opened.indexOf(currentId);
  let next = opened[position + 1];
  if (!next) { next = data.things.find(item => !opened.includes(item.id))?.id; if (next) opened.push(next); else next = opened[0]; }
  currentId = next; renderThing(true);
}));
$$('[data-previous-thing]').forEach(button => button.addEventListener('click', () => { const previous = opened[opened.indexOf(currentId) - 1]; if (previous) { currentId = previous; renderThing(true); } }));
$$('[data-add-keepsake]').forEach(button => button.addEventListener('click', () => edit(button.dataset.addKeepsake, null, button)));
$$('[data-edit-since]').forEach(button => button.addEventListener('click', () => edit('Since', data.since, button)));
$$('[data-manage-keepsakes]').forEach(button => button.addEventListener('click', () => { managing = !managing; setControls(); renderLetters(); }));
$('[data-other-letters]')?.addEventListener('change', event => {
  if (!data?.letters.some(item => item.id === event.target.value)) return;
  selectedLetterId = event.target.value; pickedRandomly = false; renderLetters();
});
$('[data-shuffle-letter]')?.addEventListener('click', () => {
  const others = data?.letters.filter(item => item.id !== selectedLetterId) || []; if (!others.length) return;
  selectedLetterId = others[Math.floor(Math.random() * others.length)].id; pickedRandomly = true; renderLetters();
});
window.addEventListener('storage', event => {
  if (event.key !== progressKey || !data) return;
  try { const saved = JSON.parse(event.newValue); if (Array.isArray(saved?.opened)) { opened = saved.opened.filter(id => typeof id === 'string'); currentId = saved.currentId; renderThing(); } } catch { /* Ignore incomplete local progress. */ }
});
refresh();
setInterval(() => { if (!document.hidden) clock(); }, 1000);
setInterval(refresh, 60000);
window.addEventListener('focus', refresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { clock(); refresh(); } });
