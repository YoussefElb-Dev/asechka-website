const $ = id => document.getElementById(id);
let data = { rolls: [], rollSize: 8 }, actor = localStorage.getItem('camera-actor') || 'asnat', stream, cameraEpoch = 0, facing = 'environment', busy = false, pending, selected, frame = 0;
const name = person => person === 'asnat' ? 'Asnat' : 'Youssef';
const active = () => data.rolls.find(roll => !roll.developedAt);
const capacityOf = roll => roll?.capacity || data.rollSize || 8;
function status(text) { $('status').textContent = text; }
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }

async function api(body) {
  let response;
  try { response = await fetch('/api/camera', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(body ? 45000 : 15000), headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json', 'X-Asechka-Camera': '1' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }); }
  catch (error) { if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('Our camera took too long to respond. Please try again.'); throw error; }
  if (response.status === 401) throw new Error('Unlock our little door again, then reopen the camera.');
  let result = {}; try { result = await response.json(); } catch {} if (!response.ok) throw new Error(result.error || 'Our camera needs a moment.'); return result;
}

function render() {
  const roll = active(), count = roll?.shots.length || 0, cap = capacityOf(roll);
  $('camera-badge-label').textContent = `ASECHKA / ${cap}`;
  $('frames-left').textContent = String(Math.max(0, cap - count)).padStart(2, '0');
  $('roll-progress').max = cap; $('roll-progress').value = count;
  $('roll-title').textContent = roll?.title || 'Our next little adventure';
  $('roll-detail').textContent = roll
    ? `${count} of ${cap} moments kept · ${roll.shots.filter(shot => shot.actor === 'asnat').length} from Asnat · ${roll.shots.filter(shot => shot.actor === 'youssef').length} from Youssef`
    : 'Load a fresh 8-shot roll and start keeping little surprises.';
  $('shoot').hidden = !roll || count >= cap; $('shoot').disabled = busy || !data.writable || !!pending;
  const full = roll && count >= cap;
  $('develop').hidden = !full; $('develop').disabled = busy || !data.writable;
  if (full) $('develop').textContent = `Develop our ${count} moments ✦`;
  const earlyBtn = $('develop-early');
  if (earlyBtn) {
    earlyBtn.hidden = !roll || count < 1 || full;
    earlyBtn.disabled = busy || !data.writable;
    earlyBtn.textContent = roll?.sundayReady ? `Sunday drop ready · Develop ${count} ${count === 1 ? 'shot' : 'shots'} ✦` : `Develop early (${count} ${count === 1 ? 'shot' : 'shots'}) ✦`;
  }
  $('new-roll').hidden = !!roll; $('new-title').disabled = busy || !data.writable; $('new-roll').querySelector('button').disabled = busy || !data.writable;
  $('retry').hidden = !pending; $('retry').disabled = busy;
  for (const button of document.querySelectorAll('[data-actor]')) { button.setAttribute('aria-pressed', String(button.dataset.actor === actor)); button.disabled = !!pending || busy; }
  $('sealed-frames').replaceChildren(...Array.from({ length: cap }, (_, i) => { const shot = roll?.shots[i], node = element('div', shot ? '♡' : String(i + 1).padStart(2, '0'), 'sealed-frame' + (shot ? ' used' : '')); node.title = shot ? `Frame ${i + 1} · ${name(shot.actor)} · sealed` : `Frame ${i + 1} · waiting`; return node; }));
  const albums = [...data.rolls].reverse().filter(roll => roll.developedAt);
  $('albums').replaceChildren(...(albums.length ? albums.map(roll => { const card = element('article', undefined, 'album-card'), words = element('div'), n = roll.shots?.length || 0; words.append(element('h3', roll.title), element('p', `${n} ${n === 1 ? 'moment' : 'moments'} · developed ${new Date(roll.developedAt).toLocaleDateString()}`)); const button = element('button', 'Open our roll ↗'); button.onclick = () => { selected = roll.id; frame = 0; reveal(); $('reveal-dialog').showModal(); }; card.append(words, button); return card; }) : [element('p', 'Your first developed roll will live here. Until then, keep a little surprise.', 'camera-note')]));
}

async function refresh() { if (busy || document.hidden) return; try { data = await api(); render(); if ($('reveal-dialog').open) reveal(); status(data.writable ? 'Our camera is connected. Both of you share this 8-shot roll.' : 'The camera connection needs restoring before saving.'); } catch (error) { status(error.message); } }
async function save(body) {
  if (busy) return; busy = true; render();
  try { data = await api(body); if (pending?.operationId === body.operationId) pending = undefined; status(body.action === 'capture' ? 'A moment kept. You’ll see it when we develop the roll. ♡' : body.action === 'develop' ? 'Our roll is developed. Open it together below. ♡' : 'Saved for both of us.'); }
  catch (error) { status(error.message + (body.action === 'capture' ? ' Your shot is sealed here; use Retry before leaving this page.' : '')); }
  finally { busy = false; render(); }
}

for (const button of document.querySelectorAll('[data-actor]')) button.onclick = () => { actor = button.dataset.actor; localStorage.setItem('camera-actor', actor); render(); };
$('new-roll').onsubmit = async event => { event.preventDefault(); await save({ action: 'create', title: $('new-title').value, actor, operationId: crypto.randomUUID() }); };
$('develop').onclick = async () => { const roll = active(); if (!roll) return; await save({ action: 'develop', rollId: roll.id, actor, operationId: crypto.randomUUID() }); };
$('develop-early')?.addEventListener('click', async () => { const roll = active(); if (!roll) return; await save({ action: 'develop', rollId: roll.id, actor, early: true, operationId: crypto.randomUUID() }); });

function stopCamera() { cameraEpoch++; stream?.getTracks().forEach(track => track.stop()); stream = undefined; $('camera-preview').srcObject = null; $('shutter').disabled = true; }
async function openCamera() {
  stopCamera(); const epoch = cameraEpoch; $('camera-message').textContent = 'Opening your camera…';
  try { if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser needs HTTPS and camera support. Try the native app or a supported browser.'); const opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false }); if (epoch !== cameraEpoch || !$('capture-dialog').open) { opened.getTracks().forEach(track => track.stop()); return; } stream = opened; $('camera-preview').srcObject = stream; await $('camera-preview').play(); $('shutter').disabled = false; $('camera-message').textContent = 'One shot. A little surprise for later.'; }
  catch (error) { $('camera-message').textContent = error.name === 'NotAllowedError' ? 'Allow camera access in your browser settings, then try again.' : error.message; }
}
$('shoot').onclick = () => { $('caption').value = ''; $('capture-dialog').showModal(); openCamera(); };
$('flip').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; openCamera(); };
$('close-camera').onclick = () => $('capture-dialog').close(); $('capture-dialog').addEventListener('close', stopCamera);
$('shutter').onclick = async () => {
  const video = $('camera-preview'), roll = active(); if (!roll || !video.videoWidth || pending) return;
  $('shutter').disabled = true;
  try {
    const canvas = document.createElement('canvas'), scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight)); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale); canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    let photo; for (let quality = .86; quality >= .30; quality -= .08) { photo = canvas.toDataURL('image/jpeg', quality); if (photo.length < 413000) break; }
    if (photo.length >= 413000) throw new Error('This frame needs a smaller copy. Try again.');
    pending = { action: 'capture', rollId: roll.id, actor, operationId: crypto.randomUUID(), caption: $('caption').value, photo }; $('capture-dialog').close(); await save(pending);
  } catch (error) { $('camera-message').textContent = error.message; $('shutter').disabled = false; }
};
$('retry').onclick = () => { if (pending) save(pending); };

async function saveShotToPhotos(shot, rollTitle, btn) {
  btn.disabled = true; btn.textContent = 'Saving to Photos…';
  try {
    const resp = await fetch('/api/camera?photo=' + encodeURIComponent(shot.id), { credentials: 'same-origin' });
    if (!resp.ok) throw new Error('Could not read frame.');
    const blob = await resp.blob();
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    const date = (shot.createdAt || new Date().toISOString()).slice(0, 10);
    const saveResp = await fetch('/api/memories', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Asechka-Memories': '1' }, body: JSON.stringify({ action: 'addPhoto', operationId: crypto.randomUUID(), date, author: shot.actor, caption: shot.caption || `From film roll: ${rollTitle}`, collection: 'memories', photo: dataUrl }) });
    if (!saveResp.ok) throw new Error('Could not save to Photos.');
    btn.textContent = 'Saved to Pictures ♡';
  } catch (error) { btn.textContent = error.message; btn.disabled = false; }
}

function reveal() {
  const roll = data.rolls.find(roll => roll.id === selected); if (!roll?.developedAt || !roll.shots?.length) return;
  const total = roll.shots.length; frame = Math.max(0, Math.min(frame, total - 1));
  const shot = roll.shots[frame]; if (!shot) return; const shotReactions = shot.reactions || {}; $('reveal-title').textContent = roll.title; $('frame-number').textContent = `${frame + 1} / ${total}`; $('previous-frame').disabled = frame === 0; $('next-frame').disabled = frame >= total - 1;
  const img = element('img'); img.alt = `Frame ${frame + 1} from ${name(shot.actor)}`; img.src = '/api/camera?photo=' + encodeURIComponent(shot.id);
  img.onerror = () => { img.alt = 'This picture couldn’t load. Reopen the roll to retry.'; };
  const reactions = element('div', undefined, 'reaction-row');
  for (const reaction of ['♡', '😂', '🥹', '✨']) { const button = element('button', reaction); button.setAttribute('aria-label', `React ${reaction}`); button.setAttribute('aria-pressed', String(shotReactions[actor] === reaction)); button.disabled = busy; button.onclick = async () => { await save({ action: 'react', rollId: roll.id, shotId: shot.id, actor, reaction: shotReactions[actor] === reaction ? '' : reaction, operationId: crypto.randomUUID() }); reveal(); }; reactions.append(button); }
  const saveBtn = element('button', 'Save to Pictures ♡', 'quiet-link');
  saveBtn.type = 'button';
  saveBtn.onclick = () => saveShotToPhotos(shot, roll.title, saveBtn);
  $('reveal-frame').replaceChildren(img, element('p', `From ${name(shot.actor)} · ${new Date(shot.createdAt).toLocaleDateString()}`, 'frame-meta'), element('p', shot.caption), reactions, element('p', `Asnat ${shotReactions.asnat || '—'} · Youssef ${shotReactions.youssef || '—'}`, 'reactions-summary'), saveBtn);
}

$('previous-frame').onclick = () => { frame = Math.max(0, frame - 1); reveal(); };
$('next-frame').onclick = () => { const roll = data.rolls.find(item => item.id === selected); const maxIndex = Math.max(0, (roll?.shots?.length || 1) - 1); frame = Math.min(maxIndex, frame + 1); reveal(); };
$('close-reveal').onclick = () => $('reveal-dialog').close();
$('refresh').onclick = refresh;
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopCamera(); if ($('capture-dialog').open) $('capture-dialog').close(); } else refresh(); });
window.addEventListener('beforeunload', event => { if (pending) { event.preventDefault(); event.returnValue = ''; } });
render(); refresh(); setInterval(refresh, 15000);
