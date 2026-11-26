import { sharedStreak, streakPolicy } from '../dist/heart-streak.js';
import { publicDailyPrompt } from './daily-prompt.js';

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const RECEIPT_LIMIT = 512;
const VIBE_TTL_MS = 24 * 60 * 60 * 1000;

export const HEART_VIBES = ['miss-you', 'goodnight', 'thinking', 'proud', 'kiss'];
export const HEART_VIBE_META = {
  'miss-you': { label: 'Miss you', symbol: '🥺' },
  'goodnight': { label: 'Goodnight', symbol: '🌙' },
  'thinking': { label: 'Thinking of you', symbol: '💭' },
  'proud': { label: 'Proud of you', symbol: '✨' },
  'kiss': { label: 'Sending a kiss', symbol: '💋' },
};

const HEART_MILESTONES = [1000, 5000, 10000, 25000, 40000, 50000, 75000, 100000, 250000, 500000, 1000000];
const STREAK_MILESTONES = [7, 14, 30, 50, 75, 100, 180, 365, 500, 730, 1000];

export function heartDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function validHeartDay(day) {
  return typeof day === 'string' && dayPattern.test(day) && Number.isFinite(Date.parse(day + 'T12:00:00Z')) && new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day;
}

function shiftDay(day, offset) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function addHearts(data, change, now) {
  const count = change.count ?? 1, day = change.day ?? heartDay(now);
  if (!validHeartDay(day) || day > heartDay(now)) throw Object.assign(new Error('Check the date on your phone, then try again.'), { status: 400 });
  data.heartDays ||= {};
  data.heartOperations ||= {};
  const receipt = `${change.from}|${count}|${day}`;
  const previous = data.heartOperations[change.operationId];
  if (previous) {
    if (previous !== receipt && (change.day || !previous.startsWith(`${change.from}|${count}|`))) throw Object.assign(new Error('This heart was already saved with a different count.'), { status: 409 });
    return false;
  }
  // Old clients have no receipt ledger; their last saved heart is still idempotent.
  if (data.hearts[change.from]?.id === change.operationId) return false;
  const values = data.heartDays[day] ||= { me: 0, asechka: 0 };
  if (!Number.isSafeInteger((values[change.from] || 0) + count)) throw Object.assign(new Error('This heart count could not be saved.'), { status: 400 });
  values[change.from] = (values[change.from] || 0) + count;
  data.heartOperations[change.operationId] = receipt;
  // Keep the permanent ledger bounded: the API publishes the newest receipts
  // for idempotent retries, and endless heart spam must not grow the shared file.
  const receipts = Object.keys(data.heartOperations);
  if (receipts.length > RECEIPT_LIMIT) for (const id of receipts.slice(0, receipts.length - RECEIPT_LIMIT)) delete data.heartOperations[id];
  data.hearts[change.from] = { id: change.operationId, sentAt: now.toISOString() };
  if (change.vibe && HEART_VIBES.includes(change.vibe)) {
    data.heartVibes ||= {};
    data.heartVibes[change.from] = { vibe: change.vibe, sentAt: now.toISOString() };
  }
  return true;
}

export function saveSharedStreak(data, now = new Date()) {
  data.heartStreak = streakPolicy(data.heartStreak);
  data.streakStatus = { ...sharedStreak(data, heartDay(now)), asOf: now.toISOString() };
}

export function activeHeartVibes(data, now = new Date()) {
  const cutoff = now.getTime() - VIBE_TTL_MS;
  const out = { me: null, asechka: null };
  for (const who of ['me', 'asechka']) {
    const raw = data?.heartVibes?.[who];
    if (!raw || !HEART_VIBES.includes(raw.vibe)) continue;
    const ms = Date.parse(raw.sentAt || '');
    if (!Number.isFinite(ms) || ms < cutoff) continue;
    out[who] = { vibe: raw.vibe, label: HEART_VIBE_META[raw.vibe].label, symbol: HEART_VIBE_META[raw.vibe].symbol, sentAt: raw.sentAt };
  }
  return out;
}

export function heartSummary(data, now = new Date()) {
  const today = heartDay(now);
  const daysMap = data?.heartDays || {};
  let me = 0, asechka = 0;
  for (const entry of Object.values(daysMap)) {
    me += Number(entry?.me) || 0;
    asechka += Number(entry?.asechka) || 0;
  }
  const total = me + asechka;
  const streak = sharedStreak(data, today).current || 0;

  const reachedHeart = [...HEART_MILESTONES].reverse().find(m => total >= m) || 0;
  const nextHeart = HEART_MILESTONES.find(m => m > total) || (Math.floor(total / 100000) + 1) * 100000;
  const celebratingHeart = reachedHeart > 0 && (total - reachedHeart) <= Math.max(500, Math.round(reachedHeart * 0.025));

  const reachedStreak = [...STREAK_MILESTONES].reverse().find(m => streak >= m) || 0;
  const nextStreak = STREAK_MILESTONES.find(m => m > streak) || streak + 50;
  const celebratingStreak = reachedStreak > 0 && (streak - reachedStreak) <= 2;

  const weeklyDays = [];
  let weeklyMe = 0, weeklyAsechka = 0, bothDays = 0, bestDay = null;
  for (let i = 6; i >= 0; i--) {
    const day = shiftDay(today, -i);
    const row = daysMap[day] || {};
    const m = Number(row.me) || 0;
    const a = Number(row.asechka) || 0;
    const sum = m + a;
    weeklyMe += m;
    weeklyAsechka += a;
    if (m > 0 && a > 0) bothDays++;
    const item = { day, me: m, asechka: a, total: sum };
    weeklyDays.push(item);
    if (sum > 0 && (!bestDay || sum > bestDay.total)) bestDay = item;
  }

  return {
    total,
    me,
    asechka,
    milestones: {
      reachedHeart,
      nextHeart,
      heartsToNext: Math.max(0, nextHeart - total),
      celebratingHeart,
      reachedStreak,
      nextStreak,
      streakToNext: Math.max(0, nextStreak - streak),
      celebratingStreak,
    },
    weekly: {
      total: weeklyMe + weeklyAsechka,
      me: weeklyMe,
      asechka: weeklyAsechka,
      bothDays,
      bestDay,
      days: weeklyDays,
    },
  };
}

export function pinnedNoteFrom(data) {
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.mode === 'jar' && m.pinned !== false && typeof m.text === 'string' && m.text.trim()) {
      return { id: m.id, from: m.from, to: m.to, text: m.text, preview: m.preview, day: m.day, createdAt: m.createdAt, mode: 'jar', pinned: true };
    }
  }
  return null;
}

export function publicTogether(data, now = new Date(), operation = '', viewer = '') {
  const { heartOperations, dailyPrompts, ...visible } = data;
  const receipt = heartOperations?.[operation]?.split('|');
  const heartReceipt = receipt?.length === 3 ? { operationId: operation, from: receipt[0], count: Number(receipt[1]), day: receipt[2] } : null;
  return {
    ...visible,
    heartStreak: streakPolicy(data.heartStreak),
    streakStatus: { ...sharedStreak(data, heartDay(now)), asOf: now.toISOString() },
    heartVibes: activeHeartVibes(data, now),
    heartSummary: heartSummary(data, now),
    pinnedNote: pinnedNoteFrom(data),
    dailyPrompt: publicDailyPrompt(data, now, viewer),
    heartReceipts: Object.keys(heartOperations || {}).slice(-512),
    ...(operation ? { heartReceipt } : {}),
  };
}
