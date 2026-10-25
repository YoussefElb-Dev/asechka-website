import { createQuoteCarousel } from './quote-carousel.js';
import { createMemoryEditor, memoryPhotoURL } from './collection-editor.js';
import { quoteBackgroundSequence, quoteBackgroundSource } from './quote-backgrounds.js';
import { postHeader, postFooter } from './soft-orbit.js';

const quoteList = document.getElementById('quote-list');
const quoteCarousel = document.getElementById('quote-carousel') ? createQuoteCarousel() : null;
const collectionStatus = document.getElementById('collection-status');
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
let socialWritable = false;
function savedConversation(content) {
  localRevision++;
  renderContent(content); lastContent = JSON.stringify(content);
}
function formatDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  return dateFormatter.format(date);
}

function renderQuotes(quotes) {
if (!quoteList) return;
const savedQuotes = (Array.isArray(quotes) ? quotes : [])
  .map(quote => typeof quote === 'string' ? { text: quote } : quote)
  .filter(quote => quote && typeof quote.text === 'string' && quote.text.trim());
const quoteFragment = document.createDocumentFragment();
const orderedQuotes = savedQuotes.slice().reverse();
const backgrounds = quoteBackgroundSequence(orderedQuotes.map(quote => quote.id || quote.text), !!quoteCarousel);
orderedQuotes.forEach((quote, index) => {
  const item = document.createElement('li');
  item.className = 'quote-item orbit-post';
  const block = document.createElement('blockquote');
  block.className = 'orbit-quote-media';
  const background = backgrounds[index];
  item.dataset.quoteBackground = String(background);
  block.style.backgroundImage = `url('${quoteBackgroundSource(background)}')`;
  const text = document.createElement('p');
  text.textContent = quote.text;
  block.append(text);
  item.append(postHeader(quote, 'quote', formatDate(quote.date)), block, postFooter(quote, 'quote', { writable: socialWritable, onSaved: savedConversation }));
  const actions = editor.cardActions('Quote', quote);
  if (actions) item.append(actions);
  quoteFragment.append(item);
});
quoteList.replaceChildren(quoteFragment);
quoteCarousel?.refresh();
document.getElementById('quote-empty').hidden = savedQuotes.length > 0;
const quoteCount = document.getElementById('quote-count');
quoteCount.hidden = savedQuotes.length === 0;
quoteCount.textContent = `${savedQuotes.length} ${savedQuotes.length === 1 ? 'quote' : 'quotes'} kept here. And counting.`;
}
let savedPhotos = [];
const photoGrid = document.getElementById('photo-grid');
const photoDialog = document.getElementById('photo-dialog');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxError = document.getElementById('lightbox-error');
const previousButton = document.getElementById('previous-photo');
const nextButton = document.getElementById('next-photo');
let currentPhoto = 0;
let photoOpener;
let waitingContent;

function photoCaption(photo) {
  return typeof photo.caption === 'string' && photo.caption.trim() ? photo.caption : 'A moment with you';
}
function photoAlt(photo) {
  return typeof photo.alt === 'string' && photo.alt.trim() ? photo.alt : photoCaption(photo);
}
function showPhoto(index) {
  if (!savedPhotos.length) return;
  currentPhoto = (index + savedPhotos.length) % savedPhotos.length;
  const photo = savedPhotos[currentPhoto];
  lightboxImage.hidden = false;
  lightboxError.hidden = true;
  lightboxImage.alt = photoAlt(photo);
  lightboxImage.src = photo.src;
  document.getElementById('lightbox-caption').textContent = photoCaption(photo);
  document.getElementById('lightbox-date').textContent = formatDate(photo.date);
  document.getElementById('lightbox-position').textContent = `${currentPhoto + 1} / ${savedPhotos.length}`;
  previousButton.hidden = nextButton.hidden = savedPhotos.length < 2;
}
lightboxImage?.addEventListener('error', () => {
  lightboxImage.hidden = true;
  lightboxError.hidden = false;
});
lightboxImage?.addEventListener('load', () => {
  lightboxImage.hidden = false;
  lightboxError.hidden = true;
});

function renderPhotos(photos) {
if (!photoGrid) return;
const focusedSrc = document.activeElement?.closest('[data-photo-src]')?.dataset.photoSrc;
savedPhotos = (Array.isArray(photos) ? photos : [])
  .filter(photo => photo && typeof photo.src === 'string' && photo.src.trim())
  .map(photo => ({ ...photo, src: memoryPhotoURL(photo).trim() }))
  .filter(photo => {
    try { return ['http:', 'https:'].includes(new URL(photo.src, document.baseURI).protocol); }
    catch { return false; }
  }).reverse();
const photoFragment = document.createDocumentFragment();
const previewLimit = Number(photoGrid.dataset.previewLimit) || savedPhotos.length;
const visiblePhotos = savedPhotos.slice(0, previewLimit);
visiblePhotos.forEach((photo, index) => {
  const button = document.createElement('button');
  button.className = 'orbit-photo-open';
  button.type = 'button';
  button.dataset.photoSrc = photo.src;
  button.setAttribute('aria-label', `Open photo: ${photoCaption(photo)}${formatDate(photo.date) ? `, ${formatDate(photo.date)}` : ''}`);
  const imageWrap = document.createElement('span');
  imageWrap.className = 'photo-image-wrap';
  const image = document.createElement('img');
  image.alt = photoAlt(photo);
  image.loading = 'lazy';
  image.decoding = 'async';
  image.src = photo.src;
  const error = document.createElement('span');
  error.className = 'photo-error';
  error.textContent = 'This photo couldn’t load.';
  error.hidden = true;
  image.addEventListener('error', () => { image.hidden = true; error.hidden = false; });
  imageWrap.append(image, error);
  button.append(imageWrap);
  button.addEventListener('click', () => {
    photoOpener = button;
    showPhoto(index);
    photoDialog.showModal();
    document.body.classList.add('dialog-open');
  });
  const actions = editor.cardActions('Photo', photo);
  const entry = document.createElement('article'); entry.className = 'photo-entry orbit-post';
  entry.append(postHeader(photo, 'photo', formatDate(photo.date)), button, postFooter(photo, 'photo', { writable: socialWritable, onSaved: savedConversation }));
  if (actions) entry.append(actions);
  photoFragment.append(entry);
});
photoGrid.replaceChildren(photoFragment);
if (focusedSrc) [...photoGrid.querySelectorAll('[data-photo-src]')].find(button => button.dataset.photoSrc === focusedSrc)?.focus({ preventScroll: true });
document.getElementById('photo-empty').hidden = savedPhotos.length > 0;
const photoCount = document.getElementById('photo-count');
photoCount.hidden = savedPhotos.length === 0;
photoCount.textContent = visiblePhotos.length < savedPhotos.length
  ? `${visiblePhotos.length} of ${savedPhotos.length} moments. There’s more in our collection.`
  : `${savedPhotos.length} ${savedPhotos.length === 1 ? 'moment' : 'moments'} I want to keep.`;
}

document.getElementById('close-photo')?.addEventListener('click', () => photoDialog.close());
previousButton?.addEventListener('click', () => showPhoto(currentPhoto - 1));
nextButton?.addEventListener('click', () => showPhoto(currentPhoto + 1));
photoDialog?.addEventListener('keydown', event => {
  if (savedPhotos.length < 2) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    showPhoto(currentPhoto + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
photoDialog?.addEventListener('click', event => {
  const bounds = photoDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) photoDialog.close();
});
photoDialog?.addEventListener('close', () => {
  document.body.classList.remove('dialog-open');
  lightboxImage.removeAttribute('src');
  photoOpener?.focus({ preventScroll: true });
  if (waitingContent) { const content = waitingContent; waitingContent = null; renderContent(content); }
});

function renderContent(content) {
  // Keep the image and keyboard focus steady while someone is browsing a photo.
  if (photoDialog?.open) { waitingContent = content; return; }
  const focusedEdit = document.activeElement?.dataset.memoryEdit;
  const focusedRemove = document.activeElement?.dataset.memoryRemove;
  editor.update(content);
  socialWritable = content.writable === true;
  renderQuotes(content.quotes);
  renderPhotos(content.photos);
  if (focusedEdit) [...document.querySelectorAll('[data-memory-edit]')].find(button => button.dataset.memoryEdit === focusedEdit)?.focus({ preventScroll: true });
  if (focusedRemove) [...document.querySelectorAll('[data-memory-remove]')].find(button => button.dataset.memoryRemove === focusedRemove)?.focus({ preventScroll: true });
}
let lastContent = '';
let checking = false;
let localRevision = 0;
const editor = createMemoryEditor({ quoteList, photoGrid, onSaved(content) {
  localRevision++;
  renderContent(content); lastContent = JSON.stringify(content);
} });
async function checkForMemories() {
  if (checking || document.hidden) return;
  checking = true;
  const startedAtRevision = localRevision;
  try {
    const response = await fetch('/api/memories', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
    if (response.status === 401 || response.redirected && new URL(response.url).pathname === '/login') {
      window.location.replace('/login');
      return;
    }
    if (!response.ok) throw new Error('Collection unavailable');
    const content = await response.json();
    if (startedAtRevision !== localRevision) return;
    if (content.version !== 1 || !Array.isArray(content.quotes) || !Array.isArray(content.photos)) throw new Error('Collection unavailable');
    const serialized = JSON.stringify(content);
    if (serialized !== lastContent) { renderContent(content); lastContent = serialized; }
    if (collectionStatus) collectionStatus.hidden = true;
  } catch {
    // Keep loaded memories visible during a brief connection problem.
    if (collectionStatus && !lastContent) collectionStatus.textContent = 'Our little collection couldn’t load just yet. We’ll try again in a moment.';
  }
  finally { checking = false; }
}
checkForMemories();
setInterval(checkForMemories, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForMemories(); });
window.addEventListener('focus', checkForMemories);
