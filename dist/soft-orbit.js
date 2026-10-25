const make = (tag, className, text) => {
  const element = document.createElement(tag);
  element.className = className;
  if (text) element.textContent = text;
  return element;
};
const names = { asnat: 'Asnat', youssef: 'Youssef' };
const paths = {
  heart: '<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
  comment: '<path d="M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-5a9 9 0 1 1 16.6-4.5Z"/>',
  share: '<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
  save: '<path d="M5 3h14v19l-7-4-7 4V3Z"/>',
};
function iconButton(symbol, label) {
  const button = make('button', 'orbit-action');
  button.type = 'button'; button.setAttribute('aria-label', label);
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[symbol]}</svg>`;
  return button;
}
function actor() {
  try { const side = localStorage.getItem('asechka-heart-side'); return side === 'me' ? 'youssef' : side === 'asechka' ? 'asnat' : null; } catch { return null; }
}
async function chooseActor() {
  if (actor()) return actor();
  return new Promise(resolve => {
    const dialog = make('dialog', 'orbit-dialog');
    const title = make('h2', '', 'Who’s leaving a little love?');
    title.id = 'orbit-identity-title'; dialog.setAttribute('aria-labelledby', title.id);
    dialog.append(title);
    for (const [value, name] of Object.entries(names)) {
      const button = make('button', 'orbit-person', name); button.type = 'button';
      button.onclick = () => { try { localStorage.setItem('asechka-heart-side', value === 'youssef' ? 'me' : 'asechka'); } catch {} dialog.returnValue = value; dialog.close(); };
      dialog.append(button);
    }
    const cancel = make('button', 'orbit-person', 'Cancel'); cancel.type = 'button'; cancel.onclick = () => dialog.close(); dialog.append(cancel);
    dialog.onclose = () => { const value = dialog.returnValue; dialog.remove(); resolve(names[value] ? value : null); };
    document.body.append(dialog); dialog.showModal();
  });
}

export function postHeader(item, kind, date) {
  const header = make('div', 'orbit-header');
  const name = names[item.author] || 'Our little us';
  const avatar = make('span', 'orbit-avatar', names[item.author] ? name[0] : '♡'); avatar.setAttribute('aria-hidden', 'true');
  const labels = make('div', 'orbit-byline');
  labels.append(make('strong', '', name), make('span', '', `${kind === 'quote' ? 'A thought' : 'A moment'}${date ? ' · ' + date : ''}`));
  header.append(avatar, labels); return header;
}

export function postFooter(item, kind, { writable, onSaved }) {
  const fragment = document.createDocumentFragment();
  const badge = make('div', 'orbit-badge'); badge.append(make('span', '', '♡  Kept close')); badge.setAttribute('aria-hidden', 'true');
  const row = make('div', 'orbit-actions');
  const like = iconButton('heart', 'Like post'), comments = iconButton('comment', 'Comments'), share = iconButton('share', 'Share post'), save = iconButton('save', 'Save post');
  const status = make('p', 'orbit-status'); status.setAttribute('role', 'status');
  let social = item.social || { likes: {}, comments: [] }, busy = false;
  const likeText = make('p', 'orbit-likes');
  const updateLike = () => {
    const liked = !!social.likes?.[actor()]; like.classList.toggle('is-active', liked); like.setAttribute('aria-pressed', String(liked)); like.setAttribute('aria-label', liked ? 'Unlike post' : 'Like post');
    const a = social.likes?.asnat, y = social.likes?.youssef;
    likeText.textContent = a && y ? 'Liked by you both ♡' : a ? 'Liked by Asnat ♡' : y ? 'Liked by Youssef ♡' : 'A little love goes a long way';
  };
  const key = `${kind}:${item.id || item.src || item.text}`;
  const isSaved = () => { try { return JSON.parse(localStorage.getItem('asechka-saved-posts') || '[]').includes(key); } catch { return false; } };
  const updateSaved = () => { const saved = isSaved(); save.classList.toggle('is-active', saved); save.setAttribute('aria-pressed', String(saved)); save.setAttribute('aria-label', saved ? 'Remove from saved' : 'Save post'); };
  save.onclick = () => { try { const keys = new Set(JSON.parse(localStorage.getItem('asechka-saved-posts') || '[]')); if (keys.has(key)) keys.delete(key); else keys.add(key); localStorage.setItem('asechka-saved-posts', JSON.stringify([...keys])); updateSaved(); } catch { status.textContent = 'Your browser couldn’t save this post. Please allow local storage.'; } };
  share.onclick = async () => { try { const data = { title: 'Our little universe', text: item.text || item.caption || 'A moment with you', url: location.origin + (kind === 'quote' ? '/quotes.html' : '/pictures.html') }; if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text}\n${data.url}`); status.textContent = 'Copied to your clipboard ♡'; } } catch (error) { if (error.name !== 'AbortError') status.textContent = 'Open this page’s address to share this collection.'; } };
  // A failed request keeps its operation ID so retrying cannot duplicate a comment.
  let retry;
  async function send(change, selectedActor) {
    if (busy) return null;
    busy = true; like.disabled = true;
    const payload = { ...change, actor: selectedActor, kind, id: item.id };
    const fingerprint = JSON.stringify(payload);
    if (retry?.fingerprint !== fingerprint) retry = { fingerprint, operationId: crypto.randomUUID() };
    try {
      const response = await fetch('/api/memories', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Asechka-Memories': '1' }, body: JSON.stringify({ ...payload, operationId: retry.operationId }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'This didn’t save yet. Please try again when connected.');
      retry = null;
      social = (result[kind === 'quote' ? 'quotes' : 'photos'].find(post => post.id === item.id)?.social) || social;
      updateLike(); return result;
    } finally { busy = false; like.disabled = false; }
  }
  const conversation = make('button', 'orbit-conversation', social.comments?.length ? `View ${social.comments.length === 1 ? '1 comment' : `all ${social.comments.length} comments`}` : 'Leave a little love…'); conversation.type = 'button';
  const canReact = writable && /^[a-f0-9-]{36}$/i.test(item.id || '');
  like.onclick = async () => {
    const who = await chooseActor(); if (!who) return;
    try { status.textContent = ''; const result = await send({ action: 'setLike', liked: !social.likes?.[who] }, who); if (result) onSaved(result); }
    catch (error) { status.textContent = error.message; }
  };
  comments.onclick = conversation.onclick = () => {
    const dialog = make('dialog', 'orbit-dialog'); dialog.setAttribute('aria-label', 'Our conversation');
    const close = make('button', 'orbit-person', 'Close'); close.type = 'button'; close.onclick = () => dialog.close();
    const list = make('div', 'orbit-comments');
    const populate = () => { list.replaceChildren(); for (const comment of social.comments || []) { const entry = make('p', ''); entry.append(make('strong', '', (names[comment.author] || 'Us') + '  '), document.createTextNode(comment.text)); list.append(entry); } if (!list.childElementCount) list.append(make('p', '', 'A little conversation, just for us.')); };
    populate();
    const form = make('form', 'orbit-comment-form'), text = make('textarea', ''); text.maxLength = 1000; text.required = true; text.placeholder = 'Leave a little love…'; text.setAttribute('aria-label', 'Your comment');
    const submit = make('button', 'orbit-person', 'Send comment'), feedback = make('p', 'orbit-status'); submit.type = 'submit'; feedback.setAttribute('role', 'status');
    let changed;
    form.append(text, submit, feedback); form.onsubmit = async event => {
      event.preventDefault(); if (!text.value.trim()) return;
      const who = await chooseActor(); if (!who) return;
      submit.disabled = true;
      try { feedback.textContent = 'Saving…'; const result = await send({ action: 'addComment', text: text.value.trim() }, who); if (result) { changed = result; text.value = ''; populate(); feedback.textContent = 'Kept here for both of us ♡'; } }
      catch (error) { feedback.textContent = error.message; } finally { submit.disabled = false; }
    };
    dialog.append(make('h2', '', 'Our conversation'), list, ...(canReact ? [form] : []), close);
    dialog.onclose = () => { dialog.remove(); conversation.focus({ preventScroll: true }); if (changed) onSaved(changed); };
    document.body.append(dialog); dialog.showModal();
  };
  if (canReact) row.append(like, comments);
  else if (social.comments?.length) row.append(comments);
  row.append(share, save); updateLike(); updateSaved();
  fragment.append(badge, row, likeText);
  const caption = kind === 'photo' ? item.caption : item.note;
  if (caption) fragment.append(make('p', 'orbit-caption', caption));
  if (canReact || social.comments?.length) fragment.append(conversation);
  fragment.append(status); return fragment;
}
