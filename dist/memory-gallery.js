import { quotes, photos } from './memories.js';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
function formatDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  return dateFormatter.format(date);
}
function addDate(parent, value) {
  const formatted = formatDate(value);
  if (!formatted) return;
  const time = document.createElement('time');
  time.dateTime = value;
  time.textContent = formatted;
  parent.append(time);
}

const savedQuotes = (Array.isArray(quotes) ? quotes : [])
  .map(quote => typeof quote === 'string' ? { text: quote } : quote)
  .filter(quote => quote && typeof quote.text === 'string' && quote.text.trim());
const quoteList = document.getElementById('quote-list');
const quoteFragment = document.createDocumentFragment();
savedQuotes.slice().reverse().forEach((quote, index) => {
  const item = document.createElement('li');
  item.className = 'quote-item';
  const number = document.createElement('span');
  number.className = 'quote-index';
  number.setAttribute('aria-hidden', 'true');
  number.textContent = String(savedQuotes.length - index).padStart(2, '0');
  const block = document.createElement('blockquote');
  const text = document.createElement('p');
  text.textContent = quote.text;
  block.append(text);
  const meta = document.createElement('div');
  meta.className = 'quote-meta';
  addDate(meta, quote.date);
  if (typeof quote.note === 'string' && quote.note.trim()) {
    const note = document.createElement('span');
    note.className = 'quote-note';
    note.textContent = quote.note;
    meta.append(note);
  }
  if (meta.childElementCount) block.append(meta);
  item.append(number, block);
  quoteFragment.append(item);
});
quoteList.append(quoteFragment);
document.getElementById('quote-empty').hidden = savedQuotes.length > 0;
const quoteCount = document.getElementById('quote-count');
quoteCount.hidden = savedQuotes.length === 0;
quoteCount.textContent = `${savedQuotes.length} ${savedQuotes.length === 1 ? 'quote' : 'quotes'} kept here. And counting.`;

const savedPhotos = (Array.isArray(photos) ? photos : [])
  .filter(photo => photo && typeof photo.src === 'string' && photo.src.trim())
  .map(photo => ({ ...photo, src: photo.src.trim() }))
  .filter(photo => {
    try { return ['http:', 'https:'].includes(new URL(photo.src, document.baseURI).protocol); }
    catch { return false; }
  }).reverse();
const photoGrid = document.getElementById('photo-grid');
const photoFragment = document.createDocumentFragment();
const photoDialog = document.getElementById('photo-dialog');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxError = document.getElementById('lightbox-error');
const previousButton = document.getElementById('previous-photo');
const nextButton = document.getElementById('next-photo');
let currentPhoto = 0;
let photoOpener;

function photoCaption(photo) {
  return typeof photo.caption === 'string' && photo.caption.trim() ? photo.caption : 'A moment with you';
}
function photoAlt(photo) {
  return typeof photo.alt === 'string' && photo.alt.trim() ? photo.alt : photoCaption(photo);
}
function showPhoto(index) {
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
lightboxImage.addEventListener('error', () => {
  lightboxImage.hidden = true;
  lightboxError.hidden = false;
});
lightboxImage.addEventListener('load', () => {
  lightboxImage.hidden = false;
  lightboxError.hidden = true;
});

savedPhotos.forEach((photo, index) => {
  const button = document.createElement('button');
  button.className = 'photo-print';
  button.type = 'button';
  button.setAttribute('aria-label', `Open photo: ${photoCaption(photo)}${formatDate(photo.date) ? `, ${formatDate(photo.date)}` : ''}`);
  const tape = document.createElement('span');
  tape.className = 'tape';
  tape.setAttribute('aria-hidden', 'true');
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
  const caption = document.createElement('span');
  caption.className = 'photo-caption';
  caption.textContent = photoCaption(photo);
  button.append(tape, imageWrap, caption);
  addDate(button, photo.date);
  button.addEventListener('click', () => {
    photoOpener = button;
    showPhoto(index);
    photoDialog.showModal();
    document.body.classList.add('dialog-open');
  });
  photoFragment.append(button);
});
photoGrid.append(photoFragment);
document.getElementById('photo-empty').hidden = savedPhotos.length > 0;
const photoCount = document.getElementById('photo-count');
photoCount.hidden = savedPhotos.length === 0;
photoCount.textContent = `${savedPhotos.length} ${savedPhotos.length === 1 ? 'moment' : 'moments'} I want to keep.`;

document.getElementById('close-photo').addEventListener('click', () => photoDialog.close());
previousButton.addEventListener('click', () => showPhoto(currentPhoto - 1));
nextButton.addEventListener('click', () => showPhoto(currentPhoto + 1));
photoDialog.addEventListener('keydown', event => {
  if (savedPhotos.length < 2) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    showPhoto(currentPhoto + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
photoDialog.addEventListener('click', event => {
  const bounds = photoDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) photoDialog.close();
});
photoDialog.addEventListener('close', () => {
  document.body.classList.remove('dialog-open');
  lightboxImage.removeAttribute('src');
  photoOpener?.focus({ preventScroll: true });
});
