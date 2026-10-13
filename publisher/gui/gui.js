const $ = selector => document.querySelector(selector);
let status;
let working = false;
let selected = [];
let historySignature = '';
const formKey = 'asechka-studio-quote-draft';

function notice(message, kind = '') {
  $('#notice').textContent = message;
  $('#notice').className = `notice ${kind}`;
  $('#notice').hidden = !message;
}
async function api(path, data) {
  const response = await fetch(path, data === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Asechka-Studio': '1' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not finish. Please try again.');
  return result;
}
function controls() {
  const disabled = working || status?.busy || !status?.writable;
  $('#save-quote').disabled = disabled;
  $('#save-photos').disabled = disabled || !selected.length;
  $('#choose-photos').disabled = disabled;
  $('#publish-pending').disabled = disabled || !status?.pending;
  $('#refresh').disabled = disabled;
  for (const input of document.querySelectorAll('#quote-form input, #quote-form textarea, #photo-date, #selected-photos input, #selected-photos button')) input.disabled = disabled;
  $('#blocked').hidden = status?.writable !== false;
  $('#save-photos').textContent = selected.length ? `Save & publish ${selected.length === 1 ? 'picture' : `${selected.length} pictures`} ↗` : 'Save & publish pictures ↗';
}
function dateLabel(date) {
  if (!date) return '';
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}
function metadata(entry) {
  const line = element('div', 'memory-meta');
  if (entry.date) line.append(element('span', '', dateLabel(entry.date)));
  if (entry.note) line.append(element('span', '', entry.note));
  if (entry.pending) line.append(element('span', 'pending-tag', 'Waiting to publish'));
  return line;
}
function empty(title, subtitle) {
  const item = element('div', 'empty', title);
  item.append(element('small', '', subtitle));
  return item;
}
function renderHistory(data) {
  const signature = JSON.stringify([data.quotes, data.photos]);
  if (signature === historySignature) return;
  historySignature = signature;
  $('#quote-count').textContent = data.quotes.length;
  $('#photo-count').textContent = data.photos.length;
  $('#quote-list').replaceChildren(...data.quotes.map(entry => {
    const card = element('article', 'memory-quote');
    card.append(element('blockquote', '', entry.text), metadata(entry));
    return card;
  }));
  if (!data.quotes.length) $('#quote-list').append(empty('Her favourite words will live here.', 'Start with something you told her.'));
  $('#photo-list').replaceChildren(...data.photos.map(entry => {
    const card = element('article', 'memory-photo');
    const image = element('img');
    image.src = entry.preview;
    image.alt = entry.caption || 'A saved picture';
    image.loading = 'lazy';
    card.append(image);
    if (entry.caption) card.append(element('p', '', entry.caption));
    card.append(metadata(entry));
    return card;
  }));
  if (!data.photos.length) $('#photo-list').append(empty('Room for all your moments.', 'Choose a picture of the two of you.'));
}
async function loadStatus() {
  try {
    status = await api('/api/status');
    $('#pending-count').textContent = status.pending;
    $('#totals').textContent = `${status.savedQuotes} ${status.savedQuotes === 1 ? 'quote' : 'quotes'} · ${status.savedPhotos} ${status.savedPhotos === 1 ? 'picture' : 'pictures'} on GitHub`;
    $('#last-saved').textContent = status.lastPublished ? `Last saved ${new Date(status.lastPublished.at).toLocaleString()}` : 'Ready when you are.';
    if (!$('#quote-date').value) $('#quote-date').value = status.today;
    if (!$('#photo-date').value) $('#photo-date').value = status.today;
    if (status.busy && status.progress) notice(status.progress);
    if (status.historyError) notice(status.historyError, 'amber');
    renderHistory(status);
    controls();
  } catch (error) { notice(error.message, 'error'); }
}
async function operation(action) {
  if (working) return;
  working = true;
  controls();
  try { await action(); }
  catch (error) { notice(error.message, 'error'); }
  finally { working = false; await loadStatus(); controls(); }
}
function persistDraft() {
  try { localStorage.setItem(formKey, JSON.stringify({ text: $('#quote-text').value, note: $('#quote-note').value, date: $('#quote-date').value })); } catch { /* A disabled browser store does not prevent saving. */ }
}
try {
  const draft = JSON.parse(localStorage.getItem(formKey) || 'null');
  if (draft) { $('#quote-text').value = draft.text || ''; $('#quote-note').value = draft.note || ''; $('#quote-date').value = draft.date || ''; }
} catch { /* Start with a blank form if the browser draft is unavailable. */ }
for (const selector of ['#quote-text', '#quote-note', '#quote-date']) $(selector).addEventListener('input', persistDraft);
$('#quote-form').addEventListener('submit', event => {
  event.preventDefault();
  void operation(async () => {
    notice('Saving your words…');
    const result = await api('/api/quote', { text: $('#quote-text').value, note: $('#quote-note').value, date: $('#quote-date').value });
    if (result.saved) { $('#quote-text').value = ''; $('#quote-note').value = ''; persistDraft(); }
    notice(result.message, result.published ? '' : 'amber');
  });
});
function selectTab(name, focus = false) {
  for (const type of ['quote', 'photo']) {
    const active = type === name;
    $(`#${type}-tab`).classList.toggle('active', active);
    $(`#${type}-tab`).setAttribute('aria-selected', active);
    $(`#${type}-tab`).tabIndex = active ? 0 : -1;
    $(`#${type}-panel`).hidden = !active;
  }
  if (focus) $(`#${name}-tab`).focus();
}
for (const type of ['quote', 'photo']) {
  $(`#${type}-tab`).addEventListener('click', () => selectTab(type));
  $(`#${type}-tab`).addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); selectTab(type === 'quote' ? 'photo' : 'quote', true); }
  });
}
function renderSelected() {
  $('#selected-photos').replaceChildren(...selected.map((entry, index) => {
    const card = element('div', 'selected-photo');
    const image = element('img'); image.src = entry.url; image.alt = entry.file.name;
    const remove = element('button', 'remove-photo', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${entry.file.name}`);
    remove.addEventListener('click', () => { URL.revokeObjectURL(entry.url); selected.splice(index, 1); renderSelected(); });
    const caption = element('input'); caption.placeholder = 'A caption, if you like…'; caption.maxLength = 1000; caption.value = entry.caption; caption.setAttribute('aria-label', `Caption for ${entry.file.name}`);
    caption.addEventListener('input', () => { entry.caption = caption.value; });
    card.append(image, remove, caption, element('div', 'filename', entry.file.name));
    return card;
  }));
  controls();
}
$('#choose-photos').addEventListener('click', () => $('#photo-files').click());
$('#photo-files').addEventListener('change', event => {
  const files = [...event.target.files];
  if (selected.length + files.length > 20) { notice('Choose up to 20 pictures at once.', 'amber'); event.target.value = ''; return; }
  for (const file of files) selected.push({ file, caption: '', url: URL.createObjectURL(file) });
  event.target.value = '';
  renderSelected();
});
async function preparePhoto(entry) {
  const image = new Image();
  image.src = entry.url;
  try { await image.decode(); } catch { throw new Error(`Could not read ${entry.file.name}. Try exporting it as JPG.`); }
  const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let blob;
  for (const quality of [.85, .78, .7, .62, .55, .45]) {
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= 1024 * 1024) break;
  }
  if (!blob || blob.size > 1024 * 1024) throw new Error(`Try a smaller copy of ${entry.file.name}.`);
  const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
  return { data, caption: entry.caption, date: $('#photo-date').value };
}
$('#save-photos').addEventListener('click', () => void operation(async () => {
  if (!$('#photo-date').reportValidity()) return;
  const photos = [];
  for (const entry of selected) { notice(`Preparing picture ${photos.length + 1} of ${selected.length}…`); photos.push(await preparePhoto(entry)); }
  notice('Saving your pictures…');
  const result = await api('/api/photos', { photos });
  if (result.saved) {
    selected = selected.filter((entry, index) => { if (!result.savedIndices.includes(index)) return true; URL.revokeObjectURL(entry.url); return false; });
    renderSelected();
  }
  notice(result.problems?.length ? `${result.message} ${result.savedCount} pictures were saved; the unreadable pictures are left here to retry.` : result.message, result.published && !result.problems?.length ? '' : 'amber');
}));
$('#publish-pending').addEventListener('click', () => void operation(async () => {
  notice('Publishing your saved memories…');
  const result = await api('/api/publish', {});
  notice(result.message, result.published ? '' : 'amber');
}));
$('#refresh').addEventListener('click', () => void operation(async () => {
  notice('Getting the latest saved album…');
  const result = await api('/api/refresh', {});
  notice(result.message, result.refreshed ? '' : 'amber');
}));
void loadStatus();
setInterval(() => void loadStatus(), 2000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void loadStatus(); });
