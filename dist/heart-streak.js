// Shared with the server. Calendar days and monthly lives always use Eastern time.
export const STREAK_POLICY = Object.freeze({
  version: 1, startedOn: '2026-10-12', seededThrough: '2026-10-25', seedDays: 13,
  timeZone: 'America/New_York', dailyRule: 'either-person', monthlyLives: 1,
});
const DAY = 86400000;
export function validStreakDay(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day + 'T12:00:00Z')) && new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day;
}
export function streakDay(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const at = day => Date.parse(day + 'T12:00:00Z');
const iso = value => new Date(value).toISOString().slice(0, 10);
function anniversary(start, day, offset = 0) {
  const date = new Date(at(day)); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + offset);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(Number(start.slice(8)), last)); return iso(date.getTime());
}
function earned(start, day) {
  if (day < start) return 0;
  const month = value => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
  return Math.max(0, 1 + month(day) - month(start) - (day < anniversary(start, day) ? 1 : 0));
}
export function streakPolicy(value) {
  if (!value) return { ...STREAK_POLICY };
  if (value.version !== 1 || !validStreakDay(value.startedOn) || !validStreakDay(value.seededThrough) || value.startedOn > value.seededThrough || !Number.isSafeInteger(value.seedDays) || value.seedDays < 0 || value.seedDays > 100000) throw new Error('Our shared streak settings could not be read.');
  return { ...STREAK_POLICY, ...value, dailyRule: 'either-person', monthlyLives: 1, timeZone: 'America/New_York' };
}
export function sharedStreak(data, today = streakDay()) {
  if (!validStreakDay(today)) throw new Error('This day could not be read.');
  const policy = streakPolicy(data?.heartStreak);
  const heartDays = data?.heartDays || {};
  const sent = day => (heartDays[day]?.me || 0) > 0 || (heartDays[day]?.asechka || 0) > 0;
  let days = policy.seedDays, lives = earned(policy.startedOn, policy.seededThrough), used = 0, lastResetOn = null;
  const protectedDays = [];
  if (today <= policy.seededThrough) {
    days = Math.max(0, days - Math.round((at(policy.seededThrough) - at(today)) / DAY));
    lives = earned(policy.startedOn, today);
  } else {
    let grants = lives;
    // Settle only completed days. Today's heart always has until Eastern midnight.
    for (let time = at(policy.seededThrough) + DAY, end = at(today); time < end; time += DAY) {
      const day = iso(time), available = earned(policy.startedOn, day);
      lives += available - grants; grants = available;
      if (sent(day)) days = days > 0 ? days + 1 : 1;
      else if (days > 0 && lives > 0) { lives--; used++; days++; protectedDays.push(day); }
      else if (days > 0) { days = 0; lastResetOn = day; }
    }
    lives += earned(policy.startedOn, today) - grants;
    if (sent(today)) days = days > 0 ? days + 1 : 1;
  }
  const next = anniversary(policy.startedOn, today, today < anniversary(policy.startedOn, today) ? 0 : 1);
  return { version: 1, today, days, lives, livesEarned: earned(policy.startedOn, today), livesUsed: used,
    protectedDays, lastResetOn, nextLifeOn: next, todayComplete: today <= policy.seededThrough || sent(today) };
}
// Include durable offline batches without counting an already-saved receipt twice.
export function projectStreak(data, operations = []) {
  const result = { ...data, heartDays: structuredClone(data?.heartDays || {}) };
  const receipts = new Set(data?.heartReceipts || []);
  for (const op of operations) {
    if (receipts.has(op.operationId) || data?.hearts?.[op.from]?.id === op.operationId) continue;
    const values = result.heartDays[op.day] ||= { me: 0, asechka: 0 };
    values[op.from] = (values[op.from] || 0) + op.count;
    receipts.add(op.operationId);
  }
  return result;
}
