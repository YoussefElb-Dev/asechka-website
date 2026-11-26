import { floatHearts } from './heart-motion.js';
import { HeartOutbox } from './heart-outbox.js';
import { sharedStreak, projectStreak, streakDay } from './heart-streak.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
const timeText = value => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
const dateText = value => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value)) : '';
const shortDay = value => value ? new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(`${value}T12:00:00`)) : '';
const uuid = () => crypto.randomUUID();
const actorFromSide = s => s === 'me' ? 'youssef' : s === 'asechka' ? 'asnat' : '';
const personName = a => a === 'asnat' ? 'Asnat' : 'Youssef';

const VIBES = [
  { id: 'miss-you', label: 'Miss you', symbol: '🥺' },
  { id: 'goodnight', label: 'Goodnight', symbol: '🌙' },
  { id: 'thinking', label: 'Thinking', symbol: '💭' },
  { id: 'proud', label: 'Proud', symbol: '✨' },
  { id: 'kiss', label: 'Kiss', symbol: '💋' },
];

let shared = null, fingerprint = '', side = '', selectedVibe = '', busy = false, filter = 'all', editing = null, returnFocus = null, chosenPhoto = null, photoBusy = false;
let lastNotified = { heartAt: null, messageId: null, promptAnswered: false };
let notifyEnabled = false;
try { side = localStorage.getItem('asechka-heart-side') || ''; } catch {}
if (!['me', 'asechka'].includes(side)) side = '';
try { notifyEnabled = localStorage.getItem('asechka-web-notify') === '1'; } catch {}
try { shared = JSON.parse(localStorage.getItem('asechka-heart-ledger') || 'null'); } catch {}

let heartSending = false, heartTimer;
const heartQueue = new HeartOutbox({
  load: () => { try { return JSON.parse(localStorage.getItem('asechka-heart-outbox') || '[]'); } catch { return []; } },
  save: items => localStorage.setItem('asechka-heart-outbox', JSON.stringify(items)),
});

function queueHeartFlush() {
  if (!heartTimer) heartTimer = setTimeout(() => { heartTimer = null; flushHearts(); }, 600);
}

async function flushHearts() {
  if (heartSending || !navigator.onLine || !heartQueue.items.length) return;
  if (busy) { queueHeartFlush(); return; }
  heartSending = true;
  const status = $('[data-heart-status]');
  try {
    while (heartQueue.items.length) {
      const body = heartQueue.seal();
      if (selectedVibe && body.from === side) body.vibe = selectedVibe;
      try {
        installState(await api('/api/together', body));
        if (body.vibe) { selectedVibe = ''; renderVibes(); }
      } catch (error) {
        if (error.status !== 409) throw error;
        const recovered = await api('/api/together?heartOperation=' + encodeURIComponent(body.operationId) + (actorFromSide(side) ? '&actor=' + actorFromSide(side) : ''));
        const receipt = recovered.heartReceipt;
        if (!receipt || receipt.operationId !== body.operationId || receipt.from !== body.from || String(receipt.count) !== String(body.count) || receipt.day !== body.day) throw error;
        installState(recovered);
      }
      heartQueue.acknowledge(body.operationId);
      renderHearts();
    }
    if (status) status.textContent = 'Every little heart is saved for both of us. ♡';
  } catch (error) {
    if (status) status.textContent = error.status === 401 ? 'Unlock our little door to send your saved hearts.' : 'Your hearts are saved on this device. We’ll try again when connected.';
    if (error.status === 401) notice(error.message, error);
  } finally {
    heartSending = false;
  }
}

window.addEventListener('online', () => { loadShared({ quiet: true }); flushHearts(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(heartTimer); heartTimer = null; flushHearts(); } else queueHeartFlush(); });

class RequestError extends Error { constructor(message, status) { super(message); this.status = status; } }
async function api(path, body, extraHeader = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(body ? 55000 : 15000),
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json', 'X-Asechka-Together': '1', ...extraHeader } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new RequestError('Our connection is taking a little longer. Your edits are still here—try again.', 0); }
  let result; try { result = await response.json(); } catch { throw new RequestError('Our little memories are taking a break. Please try again shortly.', response.status); }
  if (!response.ok) throw new RequestError(result.error || 'Please try again shortly.', response.status);
  return result;
}

function notice(text, error) {
  const target = $('[data-shared-status]'); if (target) target.textContent = text;
  $$('[data-retry-shared]').forEach(button => button.hidden = !error || error.status === 401);
  $$('[data-shared-login]').forEach(link => link.hidden = error?.status !== 401);
}

function isWritable() { return shared?.writable === true; }

function maybeNotifyPartnerActivity(next) {
  if (!notifyEnabled || !side || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const partnerSide = side === 'me' ? 'asechka' : 'me';
  const partnerActor = side === 'me' ? 'asnat' : 'youssef';
  const incomingHeartAt = next.hearts?.[partnerSide]?.sentAt || null;
  if (lastNotified.heartAt && incomingHeartAt && incomingHeartAt > lastNotified.heartAt) {
    const vibe = next.heartVibes?.[partnerSide];
    new Notification(`${personName(partnerActor)} sent you a heart ♡`, { body: vibe ? `${vibe.symbol} ${vibe.label}` : 'Thinking of you right now.' });
  }
  if (incomingHeartAt) lastNotified.heartAt = incomingHeartAt;

  const latestFromPartner = [...(next.messages || [])].reverse().find(m => m.from === partnerActor);
  if (lastNotified.messageId && latestFromPartner && latestFromPartner.id !== lastNotified.messageId) {
    new Notification(`New note from ${personName(partnerActor)} ♡`, { body: latestFromPartner.preview || 'Open Love Jar to read it.' });
  }
  if (latestFromPartner) lastNotified.messageId = latestFromPartner.id;

  const partnerAnswered = Boolean(next.dailyPrompt?.answers?.[partnerActor]?.answered);
  if (!lastNotified.promptAnswered && partnerAnswered && shared?.dailyPrompt?.day === next.dailyPrompt?.day) {
    new Notification(`${personName(partnerActor)} answered today’s question`, { body: next.dailyPrompt.revealed ? 'Both answers are revealed!' : 'Reply to unlock both answers.' });
  }
  lastNotified.promptAnswered = partnerAnswered;
}

function installState(data) {
  if (data.version !== 1 || !Array.isArray(data.bucketList) || !data.hearts) throw new RequestError('Our little plans couldn’t be read. Try again shortly.', 503);
  if (shared?.updatedAt && data.updatedAt && shared.updatedAt > data.updatedAt) return;
  if (shared?.updatedAt === data.updatedAt && (shared?.streakStatus?.asOf || '') > (data.streakStatus?.asOf || '')) return;
  maybeNotifyPartnerActivity(data);
  shared = data;
  try {
    localStorage.setItem('asechka-heart-ledger', JSON.stringify({
      version: 1, bucketList: [], hearts: data.hearts, heartDays: data.heartDays, heartVibes: data.heartVibes,
      heartSummary: data.heartSummary, pinnedNote: data.pinnedNote, dailyPrompt: data.dailyPrompt,
      heartReceipts: data.heartReceipts, heartStreak: data.heartStreak, streakStatus: data.streakStatus, updatedAt: data.updatedAt,
    }));
  } catch {}
  $$('[data-add-plan]').forEach(button => button.disabled = !isWritable());
  renderHearts(); renderSummary(); renderPinnedNote(); renderDailyPrompt();
  if (jarDialog?.open) fillJarDialog();
  const next = JSON.stringify(data.bucketList);
  if (next !== fingerprint) { fingerprint = next; renderList(); }
}

async function loadShared({ quiet = false } = {}) {
  if (busy || heartSending) return;
  const viewer = actorFromSide(side);
  try {
    installState(await api('/api/together' + (viewer ? '?actor=' + viewer : '')));
    notice(isWritable() ? 'Our little plans and hearts, saved for both of us.' : 'Shared saving is being connected. Our memories are safe.');
  } catch (error) {
    if (!quiet || error.status === 401) notice(error.message, error);
    if (error.status === 401) { if (shared) shared.writable = false; renderHearts(); $$('[data-add-plan]').forEach(button => button.disabled = true); }
  } finally { const list = $('#bucket-list'); if (list) list.setAttribute('aria-busy', 'false'); }
}

function renderSummary() {
  const list = shared?.bucketList || [], done = list.filter(item => item.completed).length, remaining = list.length - done;
  $$('[data-bucket-count]').forEach(target => target.textContent = `${remaining} ${remaining === 1 ? 'little wish' : 'little wishes'} · ${done} ${done === 1 ? 'memory' : 'memories'} made`);
  const summary = $('[data-bucket-summary]'); if (summary) summary.textContent = list.length ? `${remaining} still dreaming · ${done} we’ve made into memories.` : 'Our first little wish is waiting to be written.';
  const preview = $('[data-preview-wishes]'); if (preview) { preview.replaceChildren(); list.filter(item => !item.completed).slice(0, 3).forEach(item => preview.append(node('li', '', item.title))); }
}

function currentStreak() {
  const data = projectStreak(shared, heartQueue.items);
  return { data, result: sharedStreak(data, navigator.onLine && shared?.streakStatus?.today && Math.abs(Date.now() - Date.parse(shared.streakStatus.asOf)) < 90000 ? shared.streakStatus.today : streakDay()) };
}

let streakButton, streakDialog;
function renderStreak() {
  const invitation = $('[data-heart-invitation]'); if (!invitation) return;
  if (!streakButton) {
    streakButton = node('button', 'shared-streak'); streakButton.type = 'button'; streakButton.addEventListener('click', openHeartHistory); invitation.after(streakButton);
  }
  const { result: r } = currentStreak();
  streakButton.textContent = shared ? `✦ ${r.days} days together · ${r.lives} ${r.lives === 1 ? 'life' : 'lives'} ♡` : 'Our shared streak · connect to sync';
  streakButton.setAttribute('aria-label', shared ? `Our shared streak: ${r.days} days, ${r.lives} ${r.lives === 1 ? 'life' : 'lives'}. Open heart history` : 'Our shared heart history');
  streakButton.disabled = !shared;
  if (streakDialog?.open) fillHeartHistory();
}

function renderMilestones() {
  const host = $('[data-heart-milestones]'); if (!host) return;
  const summary = shared?.heartSummary;
  if (!summary || !summary.total) { host.hidden = true; return; }
  const m = summary.milestones || {};
  host.hidden = false;
  host.classList.toggle('is-celebrating', Boolean(m.celebratingHeart || m.celebratingStreak));
  const parts = [`${summary.total.toLocaleString()} total hearts ♡`];
  if (m.celebratingHeart) parts.push(`✦ ${m.reachedHeart.toLocaleString()} milestone reached!`);
  else if (m.nextHeart) parts.push(`${m.heartsToNext.toLocaleString()} to ${m.nextHeart.toLocaleString()}`);
  if (m.celebratingStreak) parts.push(`✦ ${m.reachedStreak}-day streak!`);
  else if (m.nextStreak && m.streakToNext <= 15) parts.push(`${m.streakToNext}d to ${m.nextStreak}-day streak`);
  host.textContent = parts.join(' · ');
}

function renderVibes() {
  const host = $('[data-heart-vibes]'); if (!host) return;
  host.replaceChildren();
  for (const v of VIBES) {
    const btn = node('button', 'heart-vibe-chip', `${v.symbol} ${v.label}`);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(selectedVibe === v.id));
    btn.disabled = !side || !isWritable();
    btn.addEventListener('click', () => {
      selectedVibe = selectedVibe === v.id ? '' : v.id;
      renderVibes();
      if (selectedVibe && side && isWritable()) {
        const heartBtn = $('[data-send-heart]');
        if (heartBtn) floatHearts(heartBtn);
        try {
          heartQueue.tap(side);
          renderHearts();
          const status = $('[data-heart-status]');
          if (status) status.textContent = `Sending ${v.symbol} ${v.label} with your heart…`;
          queueHeartFlush();
        } catch {}
      }
    });
    host.append(btn);
  }
}

function fillHeartHistory() {
  const { data, result: r } = currentStreak();
  const body = streakDialog.querySelector('.shared-heart-history-body'); body.replaceChildren();
  const totalHearts = shared?.heartSummary?.total;
  body.append(
    node('p', 'shared-heart-total', `${r.days} days together · ${r.lives} ${r.lives === 1 ? 'life' : 'lives'} saved${totalHearts ? ` · ${totalHearts.toLocaleString()} hearts ♡` : ''}`),
    node('p', '', 'One heart from either of us keeps our day. A missed day automatically uses one shared life. Without a life, we start again with our next heart.'),
    node('p', '', `Unused lives stack. Our next life arrives ${dateText(r.nextLifeOn)}; we get one more on the 12th each month. Days end at midnight Eastern time.`)
  );
  const weekly = shared?.heartSummary?.weekly;
  if (weekly?.days?.length) {
    const recap = node('div', 'weekly-recap');
    recap.append(node('strong', '', `Last 7 days · ${weekly.total.toLocaleString()} hearts (${weekly.bothDays}/7 days from both)`));
    const bars = node('div', 'weekly-recap-bars');
    const max = Math.max(1, ...weekly.days.map(d => d.total));
    for (const d of weekly.days) {
      const col = node('div', 'weekly-bar-col');
      const bar = node('div', 'weekly-bar');
      bar.style.height = `${Math.max(8, Math.round((d.total / max) * 44))}px`;
      bar.title = `${dateText(d.day)}: Youssef ${d.me} · Asnat ${d.asechka}`;
      col.append(bar, node('span', '', shortDay(d.day)));
      bars.append(col);
    }
    recap.append(bars);
    if (weekly.bestDay) recap.append(node('p', 'pinned-note-meta', `Biggest day: ${dateText(weekly.bestDay.day)} (${weekly.bestDay.total.toLocaleString()} ♡)`));
    body.append(recap);
  }
  const days = new Set([...Object.keys(data.heartDays), ...r.protectedDays]);
  if (!days.size) body.append(node('p', '', 'Our daily heart history starts with our first heart.'));
  for (const day of [...days].sort().reverse()) {
    const row = node('div', 'shared-heart-history-day'); row.append(node('strong', '', dateText(day)));
    row.append(node('span', '', r.protectedDays.includes(day) ? '♡ Protected with a life' : `Youssef ${data.heartDays[day]?.me || 0} ♡ · Asnat ${data.heartDays[day]?.asechka || 0} ♡`));
    body.append(row);
  }
}

function openHeartHistory() {
  if (!streakDialog) {
    streakDialog = node('dialog', 'shared-heart-history'); streakDialog.setAttribute('aria-labelledby', 'heart-history-title');
    const heading = node('h2', '', 'Our little heart history'); heading.id = 'heart-history-title';
    const close = node('button', 'shared-heart-history-close', 'Done'); close.type = 'button'; close.addEventListener('click', () => streakDialog.close());
    streakDialog.append(heading, node('div', 'shared-heart-history-body'), close); document.body.append(streakDialog);
    streakDialog.addEventListener('close', () => streakButton.focus({ preventScroll: true }));
  }
  fillHeartHistory(); streakDialog.showModal();
}

function renderHearts() {
  renderStreak();
  renderVibes();
  renderMilestones();
  const select = $('[data-heart-side]'); if (select && select.value !== side) select.value = side;
  if (select) select.disabled = busy;
  const button = $('[data-send-heart]'); if (button) { button.disabled = !side || !isWritable(); button.setAttribute('aria-label', side === 'asechka' ? 'Send him a thinking-of-you heart' : 'Send Asechka a thinking-of-you heart'); }
  const invitation = $('[data-heart-invitation]'); if (invitation) invitation.textContent = !side ? 'Choose your side, then leave a little heart.' : side === 'asechka' ? 'A little heart, from you to him.' : 'A little heart, from you to Asechka.';
  const message = $('[data-heart-message]'), own = $('[data-own-heart]'); if (!message) return;
  message.replaceChildren();
  if (!side) { message.append(node('span', '', 'Your little hearts will wait here for each other.')); if (own) own.textContent = ''; return; }
  const partnerSide = side === 'me' ? 'asechka' : 'me';
  const incoming = shared?.hearts[partnerSide];
  const partnerVibe = shared?.heartVibes?.[partnerSide];
  if (incoming) {
    message.append(node('span', '', side === 'me' ? 'Asnat was thinking of you. ♡ ' : 'Youssef was thinking of you. ♡ '));
    const time = node('time', '', timeText(incoming.sentAt)); time.dateTime = incoming.sentAt; message.append(time);
    if (partnerVibe) message.append(node('span', 'heart-vibe-badge', `${partnerVibe.symbol} ${partnerVibe.label}`));
  } else {
    message.append(node('span', '', side === 'me' ? 'A little place for a heart from Asnat.' : 'A little place for a heart from Youssef.'));
  }
  const pending = heartQueue.items.filter(item => item.from === side).reduce((sum, item) => sum + item.count, 0);
  const sent = shared?.hearts[side];
  if (own) own.textContent = sent || pending ? `Your last little heart: ${sent ? timeText(sent.sentAt) : 'just now'}${pending ? ' (' + pending + ' saved on this device)' : ''}` : '';
}

const heartSide = $('[data-heart-side]');
heartSide?.addEventListener('change', () => {
  side = heartSide.value;
  try { localStorage.setItem('asechka-heart-side', side); } catch {}
  const st = $('[data-heart-status]'); if (st) st.textContent = '';
  renderHearts(); renderDailyPrompt(); loadShared({ quiet: true });
});

$('[data-send-heart]')?.addEventListener('click', event => {
  if (!side || !isWritable()) return;
  floatHearts(event.currentTarget);
  const status = $('[data-heart-status]');
  try { heartQueue.tap(side); renderHearts(); status.textContent = 'Your little hearts are saved on this device. ♡'; queueHeartFlush(); }
  catch { status.textContent = 'This browser couldn’t save that heart. Please free some storage and try again.'; }
});

// --- Pinned Love Jar Note & Modal ---
let jarDialog;
function renderPinnedNote() {
  const host = $('[data-pinned-note]'); if (!host) return;
  host.replaceChildren();
  const pinned = shared?.pinnedNote;
  const unreadCount = (shared?.messages || []).filter(m => !m.closedAt && m.to === actorFromSide(side)).length;
  if (pinned) {
    host.append(
      node('p', 'pinned-note-quote', pinned.text),
      node('p', 'pinned-note-meta', `From ${personName(pinned.from)} · ${dateText(pinned.day)}${unreadCount ? ` · ${unreadCount} unread` : ''}`)
    );
  } else if (unreadCount > 0) {
    host.append(node('p', 'pinned-note-quote', `You have ${unreadCount} unread ${unreadCount === 1 ? 'note' : 'notes'} waiting in the Love Jar ♡`));
  } else {
    host.append(node('p', 'soft-loading', 'No pinned note yet. Open the Love Jar to leave a note that stays right here.'));
  }
}

function openLoveJar() {
  if (!jarDialog) {
    jarDialog = node('dialog', 'jar-dialog');
    jarDialog.setAttribute('aria-label', 'Our Love Jar');
    document.body.append(jarDialog);
  }
  fillJarDialog();
  if (!jarDialog.open) jarDialog.showModal();
}

function fillJarDialog() {
  if (!jarDialog) return;
  jarDialog.replaceChildren();
  const head = node('div', 'hub-card-top');
  head.append(node('h2', 'hub-card-heading', 'Our Love Jar ♡'));
  const close = node('button', 'quiet-link', 'Close'); close.type = 'button'; close.onclick = () => jarDialog.close(); head.append(close);
  jarDialog.append(head);

  const actor = actorFromSide(side);
  const statusLine = node('p', 'prompt-feedback', actor ? `Writing as ${personName(actor)}.` : 'Choose your side on the heart bar first.');
  const form = node('form', 'jar-form');
  const textarea = node('textarea', ''); textarea.maxLength = 1000; textarea.placeholder = 'Write a note to keep in our Love Jar…'; textarea.required = true;
  const modes = node('div', 'jar-mode-row');
  const jarRadio = Object.assign(document.createElement('input'), { type: 'radio', name: 'jar-mode', value: 'jar', checked: true });
  const onceRadio = Object.assign(document.createElement('input'), { type: 'radio', name: 'jar-mode', value: 'once' });
  const l1 = node('label', ''); l1.append(jarRadio, document.createTextNode(' Keep & pin on Home'));
  const l2 = node('label', ''); l2.append(onceRadio, document.createTextNode(' Read once (secret)'));
  modes.append(l1, l2);
  const submit = node('button', 'hub-action-btn', 'Drop into Love Jar ♡'); submit.type = 'submit'; submit.disabled = !actor || !isWritable();
  form.append(textarea, modes, submit, statusLine);
  form.onsubmit = async event => {
    event.preventDefault();
    if (!actor || !textarea.value.trim()) return;
    submit.disabled = true; statusLine.textContent = 'Saving your note…';
    try {
      const mode = jarRadio.checked ? 'jar' : 'once';
      const saved = await api('/api/together', { action: 'sendMessage', actor, text: textarea.value.trim(), mode, pinned: mode === 'jar', operationId: uuid() });
      textarea.value = '';
      installState(saved);
      statusLine.textContent = mode === 'jar' ? 'Pinned to our Love Jar ♡' : 'Sealed for them to read once ♡';
    } catch (error) { statusLine.textContent = error.message; }
    finally { submit.disabled = !actor || !isWritable(); }
  };
  jarDialog.append(form);

  const list = node('div', 'jar-list');
  const items = [...(shared?.messages || [])].reverse();
  if (!items.length) list.append(node('p', 'soft-loading', 'Your Love Jar notes will stay here.'));
  for (const m of items) {
    const card = node('div', 'jar-item');
    const h = node('div', 'jar-item-head');
    h.append(node('span', '', `${personName(m.from)} → ${personName(m.to)} · ${dateText(m.day)}`), node('span', '', m.pinned ? '📌 Pinned' : m.mode === 'jar' ? 'Love Jar' : m.closedAt ? 'Opened once' : 'Sealed'));
    card.append(h);
    const canReadFull = typeof m.text === 'string' && (m.mode === 'jar' || m.to === actor || m.from === actor);
    card.append(node('p', '', canReadFull ? m.text : (m.preview || 'A little note, kept in memory.')));
    const acts = node('div', 'jar-item-actions');
    if (m.mode === 'jar' && typeof m.text === 'string' && actor && isWritable()) {
      const pinBtn = node('button', 'quiet-link', m.pinned ? 'Unpin' : 'Pin to Home'); pinBtn.type = 'button';
      pinBtn.onclick = async () => {
        try { installState(await api('/api/together', { action: 'pinMessage', actor, id: m.id, pinned: !m.pinned, operationId: uuid() })); }
        catch (e) { statusLine.textContent = e.message; }
      };
      acts.append(pinBtn);
    }
    if (!m.closedAt && m.to === actor && isWritable()) {
      const ackBtn = node('button', 'quiet-link', m.mode === 'jar' ? 'Mark read ♡' : 'Close & seal preview'); ackBtn.type = 'button';
      ackBtn.onclick = async () => {
        try { installState(await api('/api/together', { action: 'closeMessage', actor, id: m.id, operationId: uuid() })); }
        catch (e) { statusLine.textContent = e.message; }
      };
      acts.append(ackBtn);
    }
    if (acts.childElementCount) card.append(acts);
    list.append(card);
  }
  jarDialog.append(list);
}
$$('[data-open-jar]').forEach(btn => btn.addEventListener('click', openLoveJar));

// --- Daily Question / Prompt Card ---
function renderDailyPrompt() {
  const qEl = $('[data-prompt-question]'), body = $('[data-prompt-body]'), form = $('[data-prompt-form]'), pill = $('[data-prompt-pill]');
  if (!qEl || !body || !form) return;
  const dp = shared?.dailyPrompt;
  if (!dp) { qEl.textContent = 'Loading today’s question…'; return; }
  qEl.textContent = dp.prompt;
  const actor = actorFromSide(side);
  const partner = actor === 'asnat' ? 'youssef' : 'asnat';
  const mine = actor ? dp.answers?.[actor] : null;
  const theirs = actor ? dp.answers?.[partner] : null;

  if (pill) {
    pill.classList.toggle('is-revealed', Boolean(dp.revealed));
    pill.textContent = dp.revealed ? 'Revealed ♡' : (mine?.answered || theirs?.answered) ? '1 of 2 answered' : 'New today';
  }

  body.replaceChildren();
  if (dp.revealed) {
    const list = node('div', 'prompt-answers');
    for (const who of ['asnat', 'youssef']) {
      const row = node('div', 'prompt-answer-row');
      row.append(node('strong', '', personName(who)), node('p', '', dp.answers[who]?.text || ''));
      list.append(row);
    }
    const saveQuoteBtn = node('button', 'quiet-link', 'Save both answers to Quotes ♡'); saveQuoteBtn.type = 'button';
    saveQuoteBtn.onclick = async () => {
      saveQuoteBtn.disabled = true; saveQuoteBtn.textContent = 'Saving to Quotes…';
      try {
        const text = `${dp.prompt}\nAsnat: ${dp.answers.asnat.text}\nYoussef: ${dp.answers.youssef.text}`;
        const res = await fetch('/api/memories', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Asechka-Memories': '1' }, body: JSON.stringify({ action: 'addQuote', operationId: uuid(), date: dp.day, text, note: 'From Today’s Question', ...(actor ? { author: actor } : {}) }) });
        if (!res.ok) throw new Error('Could not save quote right now.');
        saveQuoteBtn.textContent = 'Saved to Quotes ♡';
      } catch (e) { saveQuoteBtn.textContent = e.message; saveQuoteBtn.disabled = false; }
    };
    body.append(list, saveQuoteBtn);
    form.hidden = true;
    return;
  }

  if (actor && mine?.answered) {
    const list = node('div', 'prompt-answers');
    const mineRow = node('div', 'prompt-answer-row'); mineRow.append(node('strong', '', `${personName(actor)} (you)`), node('p', '', mine.text || 'Saved ♡'));
    const waitRow = node('div', 'prompt-answer-row is-blurred'); waitRow.append(node('strong', '', personName(partner)), node('p', '', 'Waiting for their reply to unlock both answers together…'));
    list.append(mineRow, waitRow);
    body.append(list);
    form.hidden = true;
    return;
  }

  if (actor && theirs?.answered) {
    const hint = node('div', 'prompt-answer-row is-blurred');
    hint.append(node('strong', '', `${personName(partner)} already replied!`), node('p', '', 'Answer below to reveal what they wrote for you today.'));
    body.append(hint);
  } else if (!actor) {
    body.append(node('p', 'soft-loading', 'Choose your side on the heart card to answer today’s question.'));
  }
  form.hidden = !actor || !isWritable();
}

$('[data-prompt-form]')?.addEventListener('submit', async event => {
  event.preventDefault();
  const actor = actorFromSide(side), input = $('[data-prompt-input]'), fb = $('[data-prompt-feedback]'), btn = $('[data-prompt-submit]');
  if (!actor || !input?.value.trim()) return;
  btn.disabled = true; fb.textContent = 'Saving…';
  try {
    const saved = await api('/api/together', { action: 'answerPrompt', actor, text: input.value.trim(), day: shared?.dailyPrompt?.day, operationId: uuid() });
    input.value = ''; fb.textContent = '';
    installState(saved);
  } catch (e) { fb.textContent = e.message; }
  finally { btn.disabled = false; }
});

// --- Song of the Moment on Home ---
async function loadMomentSong() {
  const host = $('[data-moment-song]'); if (!host) return;
  try {
    const data = await api('/api/music');
    const song = data.moment || data.tracks?.[0] || null;
    host.replaceChildren();
    if (!song) { host.append(node('p', 'soft-loading', 'Pick a song that feels like today on Music.')); return; }
    const row = node('div', 'moment-song-row');
    if (song.artworkUrl && /^https:\/\/[^/]+\.mzstatic\.com\//.test(song.artworkUrl)) {
      const img = node('img', 'moment-song-art'); img.src = song.artworkUrl; img.alt = song.title; img.loading = 'lazy'; row.append(img);
    }
    const meta = node('div', 'moment-song-meta');
    meta.append(node('strong', '', song.title), node('span', '', `${song.artist}${song.actor ? ` · picked by ${personName(song.actor)}` : data.moment ? '' : ' · #1 in soundtrack'}`));
    row.append(meta);
    host.append(row);
    if (song.note) host.append(node('p', 'moment-song-note', song.note));
    const links = node('div', 'moment-song-links');
    if (song.trackUrl && /^https:\/\/(?:music|itunes)\.apple\.com\//.test(song.trackUrl)) {
      const a = node('a', 'daily-link', 'Apple Music ↗'); a.href = song.trackUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a);
    }
    const sp = node('a', 'daily-link', 'Spotify ↗'); sp.href = 'https://open.spotify.com/search/' + encodeURIComponent(`${song.title} ${song.artist}`); sp.target = '_blank'; sp.rel = 'noopener noreferrer'; links.append(sp);
    host.append(links);
  } catch {
    // Quietly keep fallback copy.
  }
}

// --- Camera partner-shot badge on Home ---
async function loadCameraBadge() {
  const badge = $('[data-camera-badge]'); if (!badge) return;
  try {
    const cam = await api('/api/camera');
    const roll = cam.rolls?.find(r => !r.developedAt);
    if (!roll) { badge.hidden = true; return; }
    const cap = roll.capacity || 8;
    const actor = actorFromSide(side);
    if (roll.shots.length >= cap || roll.sundayReady) {
      badge.textContent = 'Ready!'; badge.hidden = false;
    } else if (actor && roll.lastShotActor && roll.lastShotActor !== actor) {
      badge.textContent = `${roll.shots.length}/${cap}`; badge.hidden = false;
    } else if (roll.shots.length > 0) {
      badge.textContent = `${roll.shots.length}/${cap}`; badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  } catch { badge.hidden = true; }
}

// --- Opt-in Web Notifications ---
const notifyBtn = $('[data-notify-toggle]');
if (notifyBtn && typeof Notification !== 'undefined') {
  notifyBtn.hidden = false;
  const syncNotifyBtn = () => {
    const active = notifyEnabled && Notification.permission === 'granted';
    notifyBtn.setAttribute('aria-pressed', String(active));
    notifyBtn.textContent = active ? 'Alerts on' : 'Alerts';
  };
  syncNotifyBtn();
  notifyBtn.addEventListener('click', async () => {
    if (notifyEnabled && Notification.permission === 'granted') {
      notifyEnabled = false; try { localStorage.setItem('asechka-web-notify', '0'); } catch {} syncNotifyBtn(); return;
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    notifyEnabled = perm === 'granted';
    try { localStorage.setItem('asechka-web-notify', notifyEnabled ? '1' : '0'); } catch {}
    syncNotifyBtn();
  });
}

$$('[data-retry-shared]').forEach(button => button.addEventListener('click', () => { loadShared(); loadMemory(); }));

async function loadMemory() {
  const host = $('[data-daily-memory]'); if (!host) return;
  try {
    const data = await api('/api/daily-memory');
    const memory = data.throwback || data.memory;
    const kicker = $('[data-throwback-kicker]');
    if (kicker) kicker.textContent = data.throwback?.throwbackLabel ? `${data.throwback.throwbackLabel.toUpperCase()} · THROWBACK` : 'A LITTLE MEMORY, JUST FOR TODAY';
    const date = $('[data-memory-day]'); if (date) date.textContent = dateText(memory?.date || data.day);
    if (host.dataset.memoryKey === `${data.day}:${memory?.id}`) return;
    host.dataset.memoryKey = `${data.day}:${memory?.id}`; host.replaceChildren();
    if (!memory) { host.append(node('p', 'soft-loading', 'A little room for the memories we’re about to make. ♡')); return; }
    if (memory.kind === 'quote') {
      host.append(node('blockquote', 'daily-quote', memory.text)); if (memory.note) host.append(node('p', 'daily-note', memory.note));
      const link = node('a', 'daily-link', 'Find it in our quotes ↗'); link.href = '/quotes.html'; host.append(link);
    } else if (memory.kind === 'photo') {
      const photo = node('a', 'daily-photo'); photo.href = '/pictures.html'; const image = node('img'); image.src = memory.image; image.alt = memory.caption || 'A picture from our saved memories'; image.decoding = 'async';
      image.addEventListener('error', () => { image.hidden = true; photo.append(node('p', '', 'This little picture is waiting in our album.')); }, { once: true }); photo.append(image, node('p', '', memory.caption || 'one of our little moments ♡')); host.append(photo);
      const link = node('a', 'daily-link', 'Revisit our pictures ↗'); link.href = '/pictures.html'; host.append(link);
    } else if (memory.kind === 'song') {
      const song = node('div', 'daily-song'), art = node('div', 'daily-song-art'), copy = node('div');
      const validLink = typeof memory.url === 'string' && /^https:\/\/(?:music|itunes)\.apple\.com\//.test(memory.url);
      if (memory.artwork && /^https:\/\/[^/]+\.mzstatic\.com\//.test(memory.artwork) && validLink) { const image = node('img'); image.src = memory.artwork; image.alt = `${memory.album} album artwork`; art.append(image); image.addEventListener('error', () => { image.replaceWith(node('span', 'daily-song-empty', '♫')); }, { once: true }); }
      else art.append(node('span', 'daily-song-empty', '♫'));
      if (validLink) { const badge = node('a', 'itunes-badge'); badge.href = memory.url; badge.target = '_blank'; badge.rel = 'noopener noreferrer'; badge.setAttribute('aria-label', `Get ${memory.title} on iTunes Store (opens in a new tab)`); const image = node('img'); image.src = '/assets/itunes-badge.svg'; image.alt = 'Get it on iTunes Store'; badge.append(image); art.append(badge); }
      copy.append(node('h4', '', memory.title), node('p', '', memory.artist), node('p', '', memory.album)); if (validLink) { const listen = node('a', 'daily-link', 'Listen in Apple Music ↗'); listen.href = memory.url; listen.target = '_blank'; listen.rel = 'noopener noreferrer'; copy.append(listen); } song.append(art, copy); host.append(song); if (memory.note) host.append(node('p', 'daily-note', memory.note)); const link = node('a', 'daily-link', 'See our shared soundtrack ↗'); link.href = '/music.html'; host.append(link);
    }
  } catch (error) { host.dataset.memoryKey = ''; host.replaceChildren(node('p', 'soft-loading', error.status === 401 ? 'Unlock our little door to see today’s memory.' : error.message)); const retry = node('button', 'quiet-link', 'Try today’s memory again'); retry.type = 'button'; retry.addEventListener('click', loadMemory); host.append(retry); }
  finally { host.setAttribute('aria-busy', 'false'); }
}

function photoButton(item) {
  const button = node('button', 'bucket-photo-button'); button.type = 'button'; button.setAttribute('aria-label', `Open our photo for ${item.title}`);
  const image = node('img'); image.src = `/api/together-photo?kind=bucket&id=${item.photoId}`; image.alt = `Our memory: ${item.title}`; image.loading = 'lazy'; image.decoding = 'async'; button.append(image);
  image.addEventListener('error', () => { button.replaceChildren(node('span', 'bucket-photo-fallback', 'This photo is taking a little longer. Tap to try again.')); }, { once: true });
  button.addEventListener('click', () => openPhoto(item)); return button;
}
function renderList() {
  const host = $('#bucket-list'); if (!host) return;
  const active = document.activeElement, restore = active?.closest('[data-item-id]') ? { id: active.closest('[data-item-id]').dataset.itemId, action: active.dataset.planAction } : null;
  host.replaceChildren(); const list = shared?.bucketList || [];
  const empty = $('#bucket-empty'); empty.hidden = list.length !== 0;
  if (!list.length) return;
  const shown = list.filter(item => filter === 'all' || (filter === 'done' ? item.completed : !item.completed));
  if (!shown.length) { host.append(node('p', 'bucket-filter-empty', filter === 'done' ? 'Our first “we did it” moment is still ahead of us. ♡' : 'Every little wish here became a memory. Time for our next one?')); return; }
  for (const item of shown) {
    const card = node('article', 'bucket-card'); card.dataset.itemId = item.id;
    if (item.completed && item.photoId) card.append(photoButton(item));
    const content = node('div', 'bucket-card-content'), top = node('div', 'bucket-card-top'); top.append(node('span', `plan-state${item.completed ? ' done' : ''}`, item.completed ? 'We did it ♡' : 'Still dreaming'), node('span', 'plan-index', String(list.indexOf(item) + 1).padStart(2, '0')));
    content.append(top, node('h3', '', item.title)); if (item.place) { const place = node('p', 'bucket-place'); place.append(node('span', '', '⌁'), node('span', '', item.place)); content.append(place); } if (item.note) content.append(node('p', 'bucket-note', item.note));
    if (item.completedAt) content.append(node('p', 'bucket-done-date', `Made into a memory · ${dateText(item.completedAt)}`));
    const actions = node('div', 'bucket-card-actions');
    const complete = node('button', 'button button-outline', item.completed ? 'Still dreaming again' : 'We did it ♡'); complete.type = 'button'; complete.dataset.planAction = 'complete'; complete.disabled = !isWritable() || busy; complete.setAttribute('aria-label', item.completed ? `Move ${item.title} back to still dreaming` : `Complete ${item.title}`); complete.addEventListener('click', () => item.completed ? toggleItem(item, false) : openPlan(item, { complete: true })); actions.append(complete);
    const edit = node('button', 'bucket-edit', item.completed && !item.photoId ? 'Add a picture ↗' : 'Edit'); edit.type = 'button'; edit.dataset.planAction = 'edit'; edit.disabled = !isWritable() || busy; edit.setAttribute('aria-label', `Edit ${item.title}`); edit.addEventListener('click', () => openPlan(item)); actions.append(edit);
    const remove = node('button', 'bucket-remove', 'Remove'); remove.type = 'button'; remove.dataset.planAction = 'remove'; remove.disabled = !isWritable() || busy; remove.setAttribute('aria-label', `Remove ${item.title}`); remove.addEventListener('click', () => openPlan(item, { remove: true })); actions.append(remove); content.append(actions); card.append(content); host.append(card);
  }
  if (restore) host.querySelector(`[data-item-id="${restore.id}"] [data-plan-action="${restore.action}"]`)?.focus({ preventScroll: true });
}
$$('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; $$('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button))); renderList(); }));
async function toggleItem(item, completed) {
  if (busy) return; busy = true; renderList();
  try { installState(await api('/api/together', { action: 'toggleItem', id: item.id, expectedRevision: item.revision, completed, operationId: uuid() })); notice('A little wish to look forward to again.'); }
  catch (error) { notice(error.message, error); if (error.status === 409) await loadAfterConflict(); }
  finally { busy = false; renderList(); renderHearts(); }
}
async function loadAfterConflict() { try { installState(await api('/api/together')); } catch {} }
const dialog = $('#plan-dialog'), form = $('#plan-form');
function syncPhotoField() {
  const completed = $('#plan-completed').checked; $('#plan-photo-field').hidden = !completed;
  const preview = $('#plan-photo-preview'); const source = chosenPhoto || (editing?.item?.photoId ? `/api/together-photo?kind=bucket&id=${editing.item.photoId}` : null);
  preview.hidden = !source; if (source) $('#plan-photo-preview-image').src = source;
  $('#clear-chosen-photo').hidden = !chosenPhoto;
  $('#save-plan').textContent = completed ? 'Save our memory' : 'Save our wish';
}
function openPlan(item, { complete = false, remove = false } = {}) {
  if (!dialog || busy || !isWritable()) return;
  returnFocus = document.activeElement; editing = { id: item?.id || uuid(), item: item ? structuredClone(item) : null, remove }; chosenPhoto = null; photoBusy = false; form.reset();
  $('#plan-dialog-title').textContent = remove ? 'Make room for another wish.' : item ? 'Our little plan.' : 'Add a little wish.';
  $('#plan-dialog-description').textContent = remove ? '' : 'It doesn’t have to be grand. It just has to be ours.';
  form.hidden = remove; $('#delete-plan-confirmation').hidden = !remove;
  $('#delete-plan-description').textContent = remove ? `Remove “${item.title}” from our list?` : '';
  $('#plan-title').value = item?.title || ''; $('#plan-place').value = item?.place || ''; $('#plan-note').value = item?.note || '';
  $('#plan-completed').checked = complete || item?.completed || false; $('#plan-form-status').textContent = ''; $('#review-latest-plan').hidden = true; $('#plan-login').hidden = true; $('#plan-photo-help').textContent = 'Keep a picture with this completed wish.';
  $('#save-plan').disabled = false; $('#confirm-delete-plan').disabled = false; syncPhotoField();
  dialog.showModal(); document.body.classList.add('shared-dialog-open'); (remove ? $('#confirm-delete-plan') : $('#plan-title')).focus();
}
function closePlan() { if (busy || photoBusy) return; dialog.close(); }
dialog?.addEventListener('close', () => { document.body.classList.remove('shared-dialog-open'); chosenPhoto = null; editing = null; returnFocus?.focus({ preventScroll: true }); });
dialog?.addEventListener('cancel', event => { if (busy || photoBusy) event.preventDefault(); });
$$('[data-close-plan]').forEach(button => button.addEventListener('click', closePlan));
$$('[data-add-plan]').forEach(button => { button.disabled = true; button.addEventListener('click', () => openPlan(null)); });
$('#plan-completed')?.addEventListener('change', syncPhotoField);
$('#clear-chosen-photo')?.addEventListener('click', () => { chosenPhoto = null; $('#plan-photo').value = ''; $('#plan-photo-help').textContent = 'Keep a picture with this completed wish.'; syncPhotoField(); });
async function compressPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP photo.');
  if (file.size > 25000000) throw new Error('Choose a photo smaller than 25 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('This photo couldn’t be opened. Try a JPG, PNG, or WebP picture.'); }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let quality = .86, data = canvas.toDataURL('image/jpeg', quality);
    while (data.length > 420000 && quality > .34) { quality -= .08; data = canvas.toDataURL('image/jpeg', quality); }
    if (data.length > 420000) { const small = document.createElement('canvas'); small.width = Math.round(canvas.width * .65); small.height = Math.round(canvas.height * .65); small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height); data = small.toDataURL('image/jpeg', .72); }
    if (data.length > 420000) throw new Error('This picture is still a little too big. Choose a smaller version.'); return data;
  } finally { bitmap.close(); }
}
$('#plan-photo')?.addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  photoBusy = true; $('#save-plan').disabled = true; $('#plan-photo-help').textContent = 'Getting your picture ready…';
  try { chosenPhoto = await compressPhoto(file); $('#plan-photo-help').textContent = 'Your picture is ready to save with this memory. ♡'; syncPhotoField(); }
  catch (error) { $('#plan-photo-help').textContent = error.message; event.target.value = ''; }
  finally { photoBusy = false; $('#save-plan').disabled = busy; }
});
async function savePlan(remove = false) {
  if (busy || photoBusy || !editing) return;
  const snapshot = editing;
  const input = { action: remove ? 'removeItem' : 'saveItem', id: snapshot.id, expectedRevision: snapshot.item?.revision || null, operationId: uuid() };
  if (!remove) Object.assign(input, { title: $('#plan-title').value, place: $('#plan-place').value, note: $('#plan-note').value, completed: $('#plan-completed').checked, ...(chosenPhoto && $('#plan-completed').checked ? { photo: chosenPhoto } : {}) });
  busy = true; $('#save-plan').disabled = true; $('#confirm-delete-plan').disabled = true; $('#plan-form-status').textContent = remove ? 'Making a little space…' : 'Keeping this little plan for both of us…'; $('#review-latest-plan').hidden = true;
  try { installState(await api('/api/together', input)); busy = false; dialog.close(); notice(remove ? 'A little space for our next wish.' : input.completed ? 'One more little memory, kept for us. ♡' : 'Our little wish is saved. ♡'); }
  catch (error) { $('#plan-form-status').textContent = error.message; $('#plan-login').hidden = error.status !== 401; if (error.status === 409) { await loadAfterConflict(); $('#review-latest-plan').hidden = false; } }
  finally { busy = false; $('#save-plan').disabled = false; $('#confirm-delete-plan').disabled = false; renderHearts(); renderList(); }
}
form?.addEventListener('submit', event => { event.preventDefault(); savePlan(); });
$('#confirm-delete-plan')?.addEventListener('click', () => savePlan(true));
$('#review-latest-plan')?.addEventListener('click', () => { const current = shared?.bucketList.find(item => item.id === editing?.id); const removing = editing?.remove; dialog.close(); if (current) openPlan(current, { remove: removing }); else notice('This little wish was removed on the other screen.'); });
function openPhoto(item) {
  const lightbox = $('#bucket-lightbox'); if (!lightbox) return; returnFocus = document.activeElement;
  $('#bucket-lightbox-image').src = `/api/together-photo?kind=bucket&id=${item.photoId}`; $('#bucket-lightbox-image').alt = `Our memory: ${item.title}`; $('#bucket-lightbox-caption').textContent = item.title; lightbox.showModal(); document.body.classList.add('shared-dialog-open');
}
$('#close-bucket-photo')?.addEventListener('click', () => $('#bucket-lightbox').close());
$('#bucket-lightbox')?.addEventListener('close', () => { document.body.classList.remove('shared-dialog-open'); returnFocus?.focus({ preventScroll: true }); });

loadShared(); loadMemory(); loadMomentSong(); loadCameraBadge(); renderHearts(); renderPinnedNote(); renderDailyPrompt(); queueHeartFlush();
setInterval(() => { if (!document.hidden && !busy && !heartSending && !dialog?.open) { loadShared({ quiet: true }); queueHeartFlush(); } }, 5000);
setInterval(() => { if (!document.hidden && !busy) { loadMemory(); loadMomentSong(); loadCameraBadge(); } }, 60000);
window.addEventListener('focus', () => { if (!busy && !dialog?.open) { loadShared({ quiet: true }); loadMemory(); loadMomentSong(); loadCameraBadge(); } });
