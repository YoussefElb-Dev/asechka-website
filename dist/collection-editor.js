const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};

export function memoryPhotoURL(photo) {
  return /^[a-f0-9-]{36}$/i.test(photo.id || '') && /^assets\/photos\//.test(photo.src)
    ? `/api/together-photo?kind=memory&id=${encodeURIComponent(photo.id)}&v=${encodeURIComponent(photo.revision || photo.contentHash || photo.id)}`
    : photo.src;
}

async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP picture.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a picture smaller than 25 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('This picture couldn’t be opened. Try a JPG, PNG, or WebP file.'); }
  try {
    let longest = 1600;
    while (longest >= 400) {
      const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [.86, .74, .62, .5]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.length <= 420000) return data;
      }
      longest = Math.floor(longest * .7);
    }
    throw new Error('This picture is a little too detailed. Try a smaller copy.');
  } finally { bitmap.close(); }
}

export function createMemoryEditor({ onSaved, quoteList, photoGrid }) {
  let writable = false, loaded = false, busy = false, kind, editing, opener, photoData;
  let lastPayload = '', operationId;
  const toolbars = [];
  const dialog = make('dialog', 'memory-editor');
  dialog.id = 'memory-editor';
  dialog.setAttribute('aria-labelledby', 'memory-editor-title');
  dialog.innerHTML = `
    <button type="button" class="memory-editor-close" aria-label="Close editor">×</button>
    <p class="eyebrow">A LITTLE SOMETHING TO KEEP</p>
    <h2 id="memory-editor-title" class="handwritten"></h2>
    <p class="memory-editor-intro">For our collection. For both of us.</p>
    <form>
      <fieldset>
        <div data-fields="quote">
          <label for="memory-text">The words I want to keep</label>
          <textarea id="memory-text" name="text" rows="5" maxlength="10000" placeholder="Something I wanted to tell you…" dir="auto"></textarea>
          <label for="memory-note">A little note <span>(optional)</span></label>
          <input id="memory-note" name="note" maxlength="1000" placeholder="Where we were, or why it made me think of you" dir="auto">
        </div>
        <div data-fields="photo" hidden>
          <label for="memory-file">Our picture</label>
          <div class="memory-file-box"><span class="memory-file-caption">Pick a moment from your camera roll</span>
            <input id="memory-file" name="file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="memory-file-help">
          </div>
          <p id="memory-file-help" class="memory-field-help">JPG, PNG, or WebP · up to 25 MB. We’ll resize it for you.</p>
          <img class="memory-photo-preview" alt="Preview of the picture you’re saving" hidden>
          <label for="memory-caption">A caption <span>(optional)</span></label>
          <textarea id="memory-caption" name="caption" rows="2" maxlength="1000" placeholder="The story behind this little moment…" dir="auto"></textarea>
        </div>
        <label for="memory-date">A date to remember</label>
        <input id="memory-date" name="date" type="date" required>
      </fieldset>
      <p class="memory-editor-status" role="status" aria-live="polite" hidden></p>
      <div class="memory-delete-confirm" hidden>
        <p>Remove this memory from our collection? Both of us will see the change.</p>
        <div class="memory-editor-buttons"><button type="button" class="memory-confirm-remove">Yes, remove it</button><button type="button" class="memory-keep">Keep it</button></div>
      </div>
      <div class="memory-editor-buttons memory-main-buttons">
        <button class="button button-primary memory-save" type="submit">Save to our collection ♡</button>
        <button class="memory-cancel" type="button">Cancel</button>
      </div>
      <button class="memory-remove" type="button" hidden>Remove this memory</button>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const fields = form.querySelector('fieldset');
  const close = dialog.querySelector('.memory-editor-close');
  const save = dialog.querySelector('.memory-save');
  const remove = dialog.querySelector('.memory-remove');
  const status = dialog.querySelector('.memory-editor-status');
  const preview = dialog.querySelector('.memory-photo-preview');
  const file = form.elements.file;
  const confirmation = dialog.querySelector('.memory-delete-confirm');
  const mainButtons = dialog.querySelector('.memory-main-buttons');

  function message(text, error = false) {
    status.hidden = !text; status.textContent = text;
    status.classList.toggle('is-error', error);
  }
  function setBusy(value) {
    busy = value; fields.disabled = value;
    dialog.querySelectorAll('button').forEach(button => { button.disabled = value; });
    dialog.setAttribute('aria-busy', String(value));
  }
  function confirmRemove(value) {
    confirmation.hidden = !value; mainButtons.hidden = value; remove.hidden = !editing || value;
    (value ? dialog.querySelector('.memory-keep') : save).focus();
  }
  function open(nextKind, item, source) {
    if (!writable) return;
    kind = nextKind; editing = item ? { ...item } : null; opener = source;
    photoData = undefined; lastPayload = ''; operationId = undefined;
    form.reset(); message(''); preview.hidden = true; preview.removeAttribute('src');
    dialog.querySelector('[data-fields="quote"]').hidden = kind !== 'Quote';
    dialog.querySelector('[data-fields="photo"]').hidden = kind !== 'Photo';
    form.elements.text.required = kind === 'Quote';
    file.required = kind === 'Photo' && !editing;
    form.elements.text.value = item?.text || '';
    form.elements.note.value = item?.note || '';
    form.elements.caption.value = item?.caption || '';
    const today = new Date();
    form.elements.date.value = /^\d{4}-\d{2}-\d{2}$/.test(item?.date || '') ? item.date : new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    dialog.querySelector('#memory-editor-title').textContent = editing ? (kind === 'Quote' ? 'A little change to our words.' : 'A little change to our moment.') : (kind === 'Quote' ? 'Something I want to tell you.' : 'Another moment with you.');
    dialog.querySelector('.memory-file-caption').textContent = editing ? 'Keep this picture, or choose a replacement' : 'Pick a moment from your camera roll';
    if (kind === 'Photo' && editing) { preview.src = memoryPhotoURL(item); preview.hidden = false; }
    confirmation.hidden = true; mainButtons.hidden = false; remove.hidden = !editing;
    save.textContent = editing ? 'Save our changes ♡' : 'Save to our collection ♡';
    dialog.showModal(); document.body.classList.add('dialog-open');
    (kind === 'Quote' ? form.elements.text : editing ? form.elements.caption : file).focus();
  }

  for (const [list, type] of [[quoteList, 'Quote'], [photoGrid, 'Photo']]) {
    if (!list) continue;
    const toolbar = make('div', 'memory-toolbar');
    const button = make('button', 'button memory-add', type === 'Quote' ? '+ Add a quote' : '+ Add a picture');
    button.type = 'button'; button.disabled = true;
    button.addEventListener('click', () => open(type, null, button));
    const note = make('p', 'memory-toolbar-note', 'Connecting our collection…');
    note.setAttribute('role', 'status');
    toolbar.append(button, note);
    const section = list.closest('section');
    const intro = section.querySelector('.collection-intro');
    if (intro) intro.after(toolbar);
    else (section.querySelector('.quote-carousel') || list).before(toolbar);
    toolbars.push({ button, note });
  }

  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    const previous = photoData;
    setBusy(true); message('Getting your picture ready…');
    try { photoData = await preparePhoto(file.files[0]); preview.src = photoData; preview.hidden = false; message('Ready to keep. Add a caption if you’d like.'); }
    catch (error) { photoData = previous; file.value = ''; message(error.message, true); }
    finally { file.required = !editing && !photoData; setBusy(false); }
  });

  async function submit(action) {
    if (busy) return;
    const input = { action, ...(editing ? { id: editing.editKey, expectedVersion: editing.editVersion } : {}) };
    if (!action.startsWith('remove')) {
      if (!form.reportValidity()) return;
      input.date = form.elements.date.value;
      if (kind === 'Quote') {
        input.text = form.elements.text.value.trim(); input.note = form.elements.note.value.trim();
        if (!input.text) { message('Write a few words before saving this quote.', true); form.elements.text.focus(); return; }
      } else {
        input.caption = form.elements.caption.value.trim();
        if (photoData) input.photo = photoData;
        if (!editing && !photoData) { message('Choose the picture you’d like to keep.', true); return; }
      }
    }
    // Reuse the operation after a lost response, so trying again cannot add a duplicate.
    const payload = JSON.stringify(input);
    if (payload !== lastPayload) { operationId = crypto.randomUUID(); lastPayload = payload; }
    setBusy(true); message(action.startsWith('remove') ? 'Removing this memory…' : 'Saving this little memory for both of us…');
    try {
      const response = await fetch('/api/memories', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-asechka-memories': '1' }, body: JSON.stringify({ ...input, operationId }), signal: AbortSignal.timeout(65000) });
      if (response.status === 401) throw new Error('Our little door locked. Copy your words, then sign in again in another tab before retrying.');
      const content = await response.json();
      if (!response.ok) throw new Error(content.error || 'This memory couldn’t be saved. Your draft is still here.');
      if (content.version !== 1 || !Array.isArray(content.quotes) || !Array.isArray(content.photos)) throw new Error('We couldn’t confirm the save. Try again; we’ll keep just one copy.');
      onSaved(content); dialog.close();
      for (const { note } of toolbars) note.textContent = action.startsWith('remove') ? 'Removed from our shared collection.' : 'Saved for both of us ♡';
    } catch (error) {
      message(['TimeoutError', 'AbortError', 'TypeError', 'SyntaxError'].includes(error.name) ? 'The connection took a little break. Your draft is still here. Try saving again; we’ll keep just one copy.' : error.message, true);
    } finally { setBusy(false); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); submit(`${editing ? 'update' : 'add'}${kind}`); });
  remove.addEventListener('click', () => confirmRemove(true));
  dialog.querySelector('.memory-keep').addEventListener('click', () => confirmRemove(false));
  dialog.querySelector('.memory-confirm-remove').addEventListener('click', () => submit(`remove${kind}`));
  for (const button of [close, dialog.querySelector('.memory-cancel')]) button.addEventListener('click', () => { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    const replacement = editing ? [...document.querySelectorAll('[data-memory-edit]')].find(button => button.dataset.memoryEdit === editing.editKey) : null;
    (replacement || (opener?.isConnected ? opener : toolbars[0]?.button))?.focus({ preventScroll: true });
    preview.removeAttribute('src'); photoData = undefined;
  });
  return {
    update(content) {
      loaded = true; writable = content.writable === true;
      for (const { button, note } of toolbars) {
        button.disabled = !writable;
        note.textContent = writable ? 'A little addition, shared with both of us.' : 'Shared saving is taking a break. Our memories are safe.';
      }
    },
    cardActions(type, item) {
      if (!loaded || !writable || !item.editKey || !document.body.classList.contains('collection-page')) return null;
      const actions = make('div', 'memory-card-actions');
      const button = make('button', 'memory-edit', 'Edit');
      button.type = 'button'; button.dataset.memoryEdit = item.editKey;
      button.setAttribute('aria-label', type === 'Quote' ? `Edit quote: ${item.text.slice(0, 70)}` : `Edit picture: ${item.caption || 'A moment with you'}`);
      button.addEventListener('click', () => open(type, item, button));
      actions.append(button); return actions;
    },
  };
}
