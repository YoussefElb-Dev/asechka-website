const $ = id => document.getElementById(id);
const rankedList = $('ranked-tracks');
const momentSlot = $('moment-slot');
const resultsList = $('search-results');
const dialog = $('song-dialog');
const saveForm = $('song-save-form');
const rankInput = $('song-rank');
const rankWrap = $('rank-field-wrap');
const noteInput = $('song-note');
const READY_MESSAGE = 'Our shared playlist is almost ready. You can browse songs while we connect saving.';
const BADGE_URL = 'assets/itunes-badge.svg';
let tracks = [];
let moment = null;
let results = [];
let writable = false;
let loaded = false;
let authenticated = true;
let checking = false;
let mutating = false;
let searching = false;
let serializedList = '';
let preferredRank = null;
let draft = null;
let opener = null;
let searchController = null;
let searchSequence = 0;

function currentActor() {
  try {
    const side = localStorage.getItem('asechka-heart-side');
    return side === 'me' ? 'youssef' : side === 'asechka' ? 'asnat' : '';
  } catch { return ''; }
}

class MusicError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function trustedURL(value, artwork = false) {
  try {
    const url = new URL(value);
    const hostAllowed = artwork
      ? url.hostname === 'mzstatic.com' || url.hostname.endsWith('.mzstatic.com')
      : ['music.apple.com', 'itunes.apple.com'].includes(url.hostname);
    return url.protocol === 'https:' && hostAllowed && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
function catalogTrack(value) {
  if (!value || !Number.isSafeInteger(value.trackId) || value.trackId <= 0 ||
      typeof value.title !== 'string' || !value.title.trim() ||
      typeof value.artist !== 'string' || !value.artist.trim() || typeof value.album !== 'string') {
    throw new MusicError('These song details couldn’t load. Please try again.');
  }
  const artworkUrl = value.artworkUrl === '' ? '' : trustedURL(value.artworkUrl, true);
  const trackUrl = trustedURL(value.trackUrl);
  if ((value.artworkUrl !== '' && !artworkUrl) || !trackUrl) throw new MusicError('These song details couldn’t load. Please try again.');
  return { trackId: value.trackId, title: value.title, artist: value.artist, album: value.album,
    artworkUrl, trackUrl, durationMs: Number.isFinite(value.durationMs) && value.durationMs > 0 ? value.durationMs : 0 };
}
function savedList(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.tracks) ||
      payload.tracks.length > 10 || typeof payload.writable !== 'boolean') {
    throw new MusicError('Our soundtrack couldn’t load just yet. Please try again.');
  }
  const ranks = new Set();
  const saved = payload.tracks.map(value => {
    if (!Number.isInteger(value.rank) || value.rank < 1 || value.rank > 10 || ranks.has(value.rank) ||
        typeof value.id !== 'string' || !value.id || typeof value.note !== 'string') {
      throw new MusicError('Our soundtrack couldn’t load just yet. Please try again.');
    }
    ranks.add(value.rank);
    return { ...catalogTrack(value), rank: value.rank, id: value.id, note: value.note };
  });
  let savedMoment = null;
  if (payload.moment && typeof payload.moment === 'object') {
    try {
      savedMoment = {
        ...catalogTrack(payload.moment),
        id: String(payload.moment.id || ''),
        note: typeof payload.moment.note === 'string' ? payload.moment.note : '',
        actor: typeof payload.moment.actor === 'string' ? payload.moment.actor : '',
        updatedAt: typeof payload.moment.updatedAt === 'string' ? payload.moment.updatedAt : '',
      };
    } catch { savedMoment = null; }
  }
  return { tracks: saved.sort((a, b) => a.rank - b.rank), moment: savedMoment, writable: payload.writable };
}
async function request(url, options = {}) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abort = () => controller.abort();
  externalSignal?.addEventListener('abort', abort, { once: true });
  if (externalSignal?.aborted) abort();
  const timeout = setTimeout(abort, options.method === 'POST' ? 45000 : 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
    if (response.redirected && /^\/login(?:\/|$)/.test(new URL(response.url, location.href).pathname)) {
      throw new MusicError('Our little door needs reopening. Sign in again to continue.', 401);
    }
    let payload;
    try { payload = await response.json(); }
    catch { throw new MusicError('This couldn’t load just yet. Please try again.', response.status); }
    if (!response.ok) throw new MusicError(typeof payload?.error === 'string' ? payload.error : 'This couldn’t be saved just yet. Please try again.', response.status);
    return payload;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abort);
  }
}
function setStatus(message, error = false) {
  $('music-status').textContent = message;
  $('music-status').parentElement.dataset.tone = error ? 'error' : 'normal';
}
function requireLogin(error) {
  if (error.status !== 401) return false;
  authenticated = false;
  writable = false;
  setStatus('Our little door needs reopening. Sign in again to continue.', true);
  $('reopen-login').hidden = false;
  $('retry-music').hidden = true;
  $('dialog-login').hidden = !dialog.open;
  if (dialog.open) $('dialog-status').textContent = 'Reopen our little door to save this song.';
  updateControls();
  return true;
}
function byRank(rank) { return tracks.find(track => track.rank === Number(rank)); }
function rankLabel(rank) { return String(rank).padStart(2, '0'); }
function actionButton(label, className, key, handler) {
  const button = element('button', className, label);
  button.type = 'button';
  button.dataset.focusKey = key;
  button.dataset.requiresSave = 'true';
  button.addEventListener('click', handler);
  return button;
}
function preserveFocus(container, render) {
  const active = document.activeElement;
  const key = container.contains(active) ? active.dataset.focusKey : null;
  render();
  if (!key) return;
  const target = [...container.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === key);
  if (target && !target.disabled) target.focus({ preventScroll: true });
  else {
    const rank = key.match(/^slot-(\d+)-/)?.[1];
    const fallback = [...container.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === `slot-${rank}-choose`);
    if (fallback && !fallback.disabled) fallback.focus({ preventScroll: true });
  }
}
function trackPresentation(track, focusPrefix = `track-${track.trackId}`) {
  const presentation = element('div', 'track-presentation');
  const media = element('div', 'track-media');
  const artWrap = element('div', 'track-art-wrap');
  const artwork = element('img', 'track-art');
  artwork.alt = `${track.album || track.title} album artwork`;
  artwork.loading = 'lazy';
  artwork.decoding = 'async';
  artwork.hidden = true;
  const fallback = element('span', 'art-fallback', track.artworkUrl ? 'Album artwork' : 'Album artwork unavailable');
  let artFailed = !track.artworkUrl;
  let badgeFailed = false;
  artwork.addEventListener('error', () => {
    artFailed = true;
    artwork.hidden = true;
    fallback.hidden = false;
    fallback.textContent = 'Album artwork unavailable';
  });
  if (track.artworkUrl) artwork.src = track.artworkUrl;
  artWrap.append(artwork, fallback);
  const badgeLink = element('a', 'itunes-badge');
  badgeLink.dataset.focusKey = `${focusPrefix}-itunes`;
  badgeLink.href = track.trackUrl;
  badgeLink.target = '_blank';
  badgeLink.rel = 'noopener noreferrer';
  badgeLink.setAttribute('aria-label', `Get ${track.title} by ${track.artist} on iTunes Store (opens in a new tab)`);
  const badge = element('img');
  badge.alt = 'Get it on iTunes Store';
  badge.width = 115;
  const badgeFallback = element('span', 'itunes-badge-fallback', 'Open in iTunes ↗');
  badgeFallback.hidden = true;
  badge.addEventListener('load', () => {
    if (badgeFailed || artFailed) return;
    artwork.hidden = false;
    fallback.hidden = true;
  });
  badge.addEventListener('error', () => {
    badgeFailed = true;
    badge.hidden = true;
    badgeFallback.hidden = false;
    artwork.hidden = true;
    fallback.hidden = false;
    fallback.textContent = 'Album artwork unavailable';
  });
  badge.src = BADGE_URL;
  badgeLink.append(badge, badgeFallback);
  media.append(artWrap, badgeLink);
  const copy = element('div', 'track-copy');
  copy.append(element('h3', 'track-title', track.title), element('p', 'track-artist', track.artist), element('p', 'track-album', track.album));
  if (track.durationMs) {
    const seconds = Math.floor(track.durationMs / 1000);
    copy.append(element('p', 'track-duration', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`));
  }
  const service = new URL(track.trackUrl).hostname === 'itunes.apple.com' ? 'iTunes Store' : 'Apple Music';
  const listen = element('a', 'listen-link', `Listen in ${service} ↗`);
  listen.dataset.focusKey = `${focusPrefix}-listen`;
  listen.href = track.trackUrl;
  listen.target = '_blank';
  listen.rel = 'noopener noreferrer';
  listen.setAttribute('aria-label', `Listen to ${track.title} by ${track.artist} in ${service} (opens in a new tab)`);
  copy.append(listen);
  presentation.append(media, copy);
  return presentation;
}
function chooseFromSearch(rank) {
  preferredRank = rank;
  $('search-status').textContent = rank === 'moment'
    ? 'Find a song for our Song of the Moment, then choose it below.'
    : `Find a song for place #${rankLabel(rank)}, then choose it below.`;
  $('music-query').focus({ preventScroll: true });
  $('song-search').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}
function renderMoment() {
  if (!momentSlot) return;
  momentSlot.replaceChildren();
  const label = element('div', 'rank-label');
  const pickedBy = moment?.actor === 'asnat' ? 'Picked by Asnat ♡' : moment?.actor === 'youssef' ? 'Picked by Youssef ♡' : 'Appears on Home';
  label.append(element('b', '', 'NOW'), element('span', '', pickedBy));
  momentSlot.append(label);
  if (moment) {
    momentSlot.append(trackPresentation(moment, 'moment'));
    if (moment.note.trim()) momentSlot.append(element('p', 'song-note', moment.note));
    const actions = element('div', 'song-actions');
    actions.append(
      actionButton('Swap song', 'quiet-button', 'moment-swap', () => chooseFromSearch('moment')),
      actionButton(moment.note.trim() ? 'Edit note' : 'Add a note', 'quiet-button', 'moment-note', event => openMoment(moment, event.currentTarget)),
      actionButton('Clear', 'quiet-button remove-link', 'moment-clear', event => openClearMoment(moment, event.currentTarget))
    );
    momentSlot.append(actions);
  } else {
    const body = element('div', 'empty-slot-body');
    const record = element('div', 'empty-vinyl');
    record.setAttribute('aria-hidden', 'true');
    const copy = element('div', 'empty-slot-copy');
    copy.append(
      element('h3', '', 'No Song of the Moment yet.'),
      element('p', '', 'Pick whatever song is stuck in your head today — it shows right on our Home screen.'),
      element('p', 'handwritten', 'one tap to swap anytime ♡')
    );
    body.append(record, copy);
    momentSlot.append(body, actionButton('Choose our Song of the Moment ↗', 'button button-outline empty-slot-action', 'moment-choose', () => chooseFromSearch('moment')));
  }
}
function renderRanked() {
  preserveFocus(rankedList, () => {
    const fragment = document.createDocumentFragment();
    for (let rank = 1; rank <= 10; rank++) {
      const track = byRank(rank);
      const slot = element('li', 'ranked-slot');
      slot.setAttribute('aria-label', `Place ${rank}${track ? `: ${track.title} by ${track.artist}` : ': waiting for a song'}`);
      const label = element('div', 'rank-label');
      label.append(element('b', '', rankLabel(rank)), element('span', '', track ? 'A little piece of us' : 'A place for us'));
      slot.append(label);
      if (track) {
        slot.append(trackPresentation(track, `slot-${rank}`));
        if (track.note.trim()) slot.append(element('p', 'song-note', track.note));
        const actions = element('div', 'song-actions');
        actions.append(
          actionButton('Set as Moment ♡', 'quiet-button', `slot-${rank}-moment`, event => openMoment(track, event.currentTarget)),
          actionButton('Change song', 'quiet-button', `slot-${rank}-change`, () => chooseFromSearch(rank)),
          actionButton(track.note.trim() ? 'Edit note' : 'Add a note', 'quiet-button', `slot-${rank}-note`, event => openSave(track, rank, event.currentTarget)),
          actionButton('Remove', 'quiet-button remove-link', `slot-${rank}-remove`, event => openRemove(track, event.currentTarget))
        );
        slot.append(actions);
      } else {
        const body = element('div', 'empty-slot-body');
        const record = element('div', 'empty-vinyl');
        record.setAttribute('aria-hidden', 'true');
        const copy = element('div', 'empty-slot-copy');
        copy.append(element('h3', '', 'Waiting for a song.'), element('p', '', 'A favorite chorus, a little memory, or something we’ll discover together.'), element('p', 'handwritten', 'this one’s ours to choose'));
        body.append(record, copy);
        slot.append(body, actionButton('Choose a song ↗', 'button button-outline empty-slot-action', `slot-${rank}-choose`, () => chooseFromSearch(rank)));
      }
      fragment.append(slot);
    }
    rankedList.replaceChildren(fragment);
    $('music-count').textContent = `${tracks.length} / 10 ${tracks.length === 1 ? 'song' : 'songs'}`;
  });
}
function renderResults() {
  preserveFocus(resultsList, () => {
    const fragment = document.createDocumentFragment();
    for (const track of results) {
      const item = element('li', 'search-result');
      item.append(trackPresentation(track, `result-${track.trackId}`));
      const actions = element('div', 'result-actions');
      const existing = tracks.find(saved => saved.trackId === track.trackId);
      if (existing) actions.append(element('span', 'saved-location', `In our soundtrack at #${rankLabel(existing.rank)}`));
      actions.append(
        actionButton('Song of the Moment ♡', 'button button-primary choose-song', `result-${track.trackId}-moment`, event => openMoment(track, event.currentTarget)),
        actionButton('Add to Top 10 +', 'button button-outline choose-song', `result-${track.trackId}`, event => {
          const firstEmpty = Array.from({ length: 10 }, (_, i) => i + 1).find(rank => !byRank(rank));
          const targetRank = typeof preferredRank === 'number' ? preferredRank : (existing?.rank ?? firstEmpty ?? 1);
          openSave(track, targetRank, event.currentTarget);
        })
      );
      item.append(actions);
      fragment.append(item);
    }
    resultsList.replaceChildren(fragment);
  });
}
function updateControls() {
  const canSave = loaded && writable && authenticated && !mutating;
  document.querySelectorAll('[data-requires-save]').forEach(button => { button.disabled = !canSave; });
  $('search-button').disabled = !authenticated || searching;
  $('music-query').disabled = !authenticated;
  const dialogBlocked = !canSave || draft?.blocked;
  $('save-song').disabled = Boolean(dialogBlocked);
  $('remove-song').disabled = Boolean(dialogBlocked);
  rankInput.disabled = Boolean(dialogBlocked);
  noteInput.disabled = Boolean(dialogBlocked);
  $('refresh-dialog').disabled = checking || mutating || !authenticated;
  $('close-song-dialog').disabled = mutating;
  $('cancel-save').disabled = mutating;
  $('cancel-remove').disabled = mutating;
  saveForm.setAttribute('aria-busy', String(mutating));
  rankedList.setAttribute('aria-busy', String(checking || mutating));
}
function applyList(payload) {
  const next = savedList(payload);
  tracks = next.tracks;
  moment = next.moment;
  writable = next.writable;
  loaded = true;
  const serialized = JSON.stringify(next);
  if (serialized !== serializedList) {
    serializedList = serialized;
    renderMoment();
    renderRanked();
    renderResults();
  }
  updateControls();
}
async function refreshMusic({ allowDialog = false } = {}) {
  if (checking || mutating || !authenticated || document.hidden || (dialog.open && !allowDialog)) return false;
  checking = true;
  updateControls();
  try {
    const payload = await request('/api/music');
    if (mutating || (dialog.open && !allowDialog)) return false;
    applyList(payload);
    $('retry-music').hidden = true;
    setStatus(writable ? 'Our songs, chosen together. Both of us can update Song of the Moment or our Top 10.' : READY_MESSAGE);
    return true;
  } catch (error) {
    if (requireLogin(error)) return false;
    setStatus(loaded ? 'Our last saved songs are here. We couldn’t check for changes just yet.' : 'Our soundtrack couldn’t load just yet. You can still browse songs while we try again.', true);
    $('retry-music').hidden = false;
    return false;
  } finally { checking = false; updateControls(); }
}
function populateRanks(selectedRank) {
  const fragment = document.createDocumentFragment();
  for (let rank = 1; rank <= 10; rank++) {
    const existing = byRank(rank);
    const option = element('option', '', `#${rankLabel(rank)} · ${existing ? `${existing.title} — ${existing.artist}` : 'Waiting for a song'}`);
    option.value = String(rank);
    fragment.append(option);
  }
  rankInput.replaceChildren(fragment);
  rankInput.value = String(selectedRank);
}
function updateSlot() {
  if (!draft || draft.mode !== 'save') return;
  draft.rank = Number(rankInput.value);
  const existing = byRank(draft.rank);
  draft.expectedId = existing?.id ?? null;
  const sameSong = existing?.trackId === draft.track.trackId;
  const replacing = Boolean(existing && !sameSong);
  $('slot-description').dataset.replacing = String(replacing);
  $('slot-description').textContent = replacing
    ? `This will replace “${existing.title}” by ${existing.artist} at #${rankLabel(draft.rank)}, including its note. The other places stay as they are.`
    : sameSong ? `This song is already at #${rankLabel(draft.rank)}. Save to update its shared note.`
      : `Place #${rankLabel(draft.rank)} is waiting for this song.`;
  $('save-song').textContent = replacing ? `Replace song at #${rankLabel(draft.rank)}` : sameSong ? 'Save note' : `Save to #${rankLabel(draft.rank)}`;
}
function openDialog(button) {
  opener = button;
  $('dialog-status').textContent = '';
  $('dialog-login').hidden = true;
  $('refresh-dialog').hidden = true;
  dialog.showModal();
  document.body.classList.add('music-dialog-open');
  updateControls();
}
function openMoment(track, button) {
  if (!loaded || !writable || !authenticated || mutating) return;
  draft = { mode: 'setMoment', track, expectedId: moment?.id ?? null, blocked: false };
  $('song-dialog-eyebrow').textContent = 'SONG OF THE MOMENT';
  $('song-dialog-title').textContent = 'Play this on Home.';
  $('song-dialog-description').textContent = 'Add an optional little note (up to 240 characters) for why this song is on repeat.';
  $('dialog-track').replaceChildren(trackPresentation(track));
  if (rankWrap) rankWrap.hidden = true;
  rankInput.required = false;
  noteInput.maxLength = 240;
  noteInput.value = moment?.trackId === track.trackId ? moment.note : (track.note || '').slice(0, 240);
  $('save-song').textContent = 'Set as Song of the Moment ♡';
  saveForm.hidden = false;
  $('song-remove-confirmation').hidden = true;
  openDialog(button);
  noteInput.focus({ preventScroll: true });
}
function openClearMoment(track, button) {
  if (!loaded || !writable || !authenticated || mutating) return;
  draft = { mode: 'clearMoment', track, expectedId: track.id || null, blocked: false };
  $('song-dialog-eyebrow').textContent = 'SONG OF THE MOMENT';
  $('song-dialog-title').textContent = 'Clear our current song?';
  $('song-dialog-description').textContent = 'Your Top 10 archive stays untouched.';
  $('dialog-track').replaceChildren(trackPresentation(track));
  $('remove-description').textContent = `Clear “${track.title}” as our Song of the Moment?`;
  $('remove-song').textContent = 'Clear Song of the Moment';
  saveForm.hidden = true;
  $('song-remove-confirmation').hidden = false;
  openDialog(button);
  $('cancel-remove').focus({ preventScroll: true });
}
function openSave(track, rank, button) {
  if (!loaded || !writable || !authenticated || mutating) return;
  draft = { mode: 'save', track, rank, expectedId: null, blocked: false };
  $('song-dialog-eyebrow').textContent = 'A SONG FOR OUR LITTLE SOUNDTRACK';
  $('song-dialog-title').textContent = 'Give it a little place.';
  $('song-dialog-description').textContent = 'Choose where this song belongs and, if you like, why it reminds you of us.';
  $('dialog-track').replaceChildren(trackPresentation(track));
  if (rankWrap) rankWrap.hidden = false;
  rankInput.required = true;
  noteInput.maxLength = 500;
  saveForm.hidden = false;
  $('song-remove-confirmation').hidden = true;
  populateRanks(rank);
  const existing = byRank(rank);
  noteInput.value = existing?.trackId === track.trackId ? existing.note : '';
  updateSlot();
  openDialog(button);
  rankInput.focus({ preventScroll: true });
}
function openRemove(track, button) {
  if (!loaded || !writable || !authenticated || mutating) return;
  draft = { mode: 'remove', track, rank: track.rank, expectedId: track.id, blocked: false };
  $('song-dialog-eyebrow').textContent = 'MAKE A LITTLE ROOM';
  $('song-dialog-title').textContent = 'Let this song go?';
  $('song-dialog-description').textContent = 'Take a moment before removing a song from our shared soundtrack.';
  $('dialog-track').replaceChildren(trackPresentation(track));
  $('remove-description').textContent = `Remove “${track.title}” and its note from place #${rankLabel(track.rank)}? This leaves the place empty for another song.`;
  $('remove-song').textContent = `Remove from #${rankLabel(track.rank)}`;
  saveForm.hidden = true;
  $('song-remove-confirmation').hidden = false;
  openDialog(button);
  $('cancel-remove').focus({ preventScroll: true });
}
async function refreshDraft() {
  if (!draft || mutating) return;
  draft.blocked = true;
  $('dialog-status').textContent = 'Refreshing this place…';
  updateControls();
  if (!await refreshMusic({ allowDialog: true })) {
    $('dialog-status').textContent = authenticated ? 'We couldn’t refresh this place. Your note is still here. Try refreshing before saving again.' : 'Reopen our little door to continue.';
    $('refresh-dialog').hidden = !authenticated;
    updateControls();
    return;
  }
  if (!draft || !dialog.open) return;
  if (!writable) {
    $('dialog-status').textContent = READY_MESSAGE;
    $('refresh-dialog').hidden = false;
    updateControls();
    return;
  }
  if (draft.mode === 'remove') {
    const current = byRank(draft.rank);
    if (!current || current.id !== draft.expectedId) {
      $('dialog-status').textContent = 'This place has changed. Close this window and review the refreshed soundtrack before removing a song.';
      $('refresh-dialog').hidden = true;
      updateControls();
      return;
    }
  } else if (draft.mode === 'save') { populateRanks(draft.rank); updateSlot(); }
  else if (draft.mode === 'setMoment' || draft.mode === 'clearMoment') { draft.expectedId = moment?.id ?? null; }
  draft.blocked = false;
  $('dialog-status').textContent = 'Someone changed this place while you were choosing. We’ve refreshed it. Review the song here before confirming again.';
  $('refresh-dialog').hidden = true;
  updateControls();
}
async function mutate(action) {
  if (!draft || draft.mode !== action || draft.blocked || mutating || !loaded || !writable || !authenticated) return;
  mutating = true;
  let conflict = false;
  $('dialog-status').textContent = action === 'save' || action === 'setMoment' ? 'Keeping this little song…' : 'Making a little room…';
  updateControls();
  const body = action === 'setMoment'
    ? { action: 'setMoment', trackId: draft.track.trackId, note: noteInput.value.slice(0, 240), actor: currentActor(), expectedId: draft.expectedId }
    : action === 'clearMoment'
      ? { action: 'clearMoment', expectedId: draft.expectedId }
      : { action, rank: draft.rank, expectedId: draft.expectedId, ...(action === 'save' ? { trackId: draft.track.trackId, note: noteInput.value } : {}) };
  try {
    const payload = await request('/api/music', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Asechka-Music': '1' }, body: JSON.stringify(body) });
    applyList(payload);
    preferredRank = null;
    const message = payload.message || 'Saved for both of us ♡';
    dialog.close();
    setStatus(writable ? message : READY_MESSAGE);
  } catch (error) {
    if (requireLogin(error)) return;
    if (error.status === 409) {
      conflict = true;
      draft.blocked = true;
    } else if (!error.status || error.name === 'AbortError') {
      draft.blocked = true;
      $('dialog-status').textContent = 'We couldn’t confirm the change. Refresh this place to check whether it was saved before trying again.';
      $('refresh-dialog').hidden = false;
    } else $('dialog-status').textContent = error.message;
  } finally { mutating = false; updateControls(); }
  if (conflict) await refreshDraft();
}

$('music-search-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!authenticated) return;
  const query = $('music-query').value.trim();
  if (query.length < 2) { $('search-status').textContent = 'Try at least two letters of a song, artist, or album.'; $('music-query').focus(); return; }
  searchController?.abort();
  searchController = new AbortController();
  const sequence = ++searchSequence;
  searching = true;
  resultsList.setAttribute('aria-busy', 'true');
  $('search-status').textContent = `Finding songs for “${query}”…`;
  updateControls();
  try {
    const payload = await request(`/api/music-search?q=${encodeURIComponent(query)}`, { signal: searchController.signal });
    if (sequence !== searchSequence) return;
    if (!Array.isArray(payload?.tracks)) throw new MusicError('The songs couldn’t load just yet. Please try again.');
    const seen = new Set();
    results = payload.tracks.map(catalogTrack).filter(track => !seen.has(track.trackId) && seen.add(track.trackId));
    renderResults();
    $('search-status').textContent = results.length
      ? `${results.length} ${results.length === 1 ? 'song' : 'songs'} found for “${query}”.${writable && loaded ? ' Set as Song of the Moment or add to Top 10.' : ' Browse and listen while saving gets ready.'}`
      : `No songs found for “${query}”. Try another title or add the artist’s name.`;
  } catch (error) {
    if (sequence !== searchSequence || requireLogin(error)) return;
    $('search-status').textContent = error.name === 'AbortError' ? 'The search took a little too long. Please try again.' : error instanceof MusicError ? error.message : 'The songs couldn’t load just yet. Check your connection and try again.';
  } finally {
    if (sequence === searchSequence) { searching = false; resultsList.setAttribute('aria-busy', 'false'); updateControls(); }
  }
});
rankInput.addEventListener('change', updateSlot);
saveForm.addEventListener('submit', event => { event.preventDefault(); if (draft && saveForm.reportValidity()) void mutate(draft.mode); });
$('remove-song').addEventListener('click', () => { if (draft) void mutate(draft.mode); });
for (const id of ['close-song-dialog', 'cancel-save', 'cancel-remove']) $(id).addEventListener('click', () => { if (!mutating) dialog.close(); });
dialog.addEventListener('cancel', event => { if (mutating) event.preventDefault(); });
dialog.addEventListener('close', () => {
  document.body.classList.remove('music-dialog-open');
  const key = opener?.dataset.focusKey;
  draft = null;
  const target = opener?.isConnected ? opener : [...document.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === key);
  if (target && !target.disabled) target.focus({ preventScroll: true });
  opener = null;
  if (!mutating) void refreshMusic();
});
$('refresh-dialog').addEventListener('click', () => void refreshDraft());
$('retry-music').addEventListener('click', () => void refreshMusic());
window.addEventListener('focus', () => void refreshMusic());
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshMusic(); });
renderMoment();
renderRanked();
updateControls();
void refreshMusic();
setInterval(() => void refreshMusic(), 20000);
