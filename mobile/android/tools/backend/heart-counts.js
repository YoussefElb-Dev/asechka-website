import { sharedStreak, streakPolicy } from '../../../../dist/heart-streak.js';
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
export function heartDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function validHeartDay(day) {
  return typeof day === 'string' && dayPattern.test(day) && Number.isFinite(Date.parse(day + 'T12:00:00Z')) && new Date(day + 'T12:00:00Z').toISOString().slice(0,10) === day;
}
export function addHearts(data, change, now) {
  const count = change.count ?? 1, day = change.day ?? heartDay(now);
  if (!validHeartDay(day) || day > heartDay(now)) throw Object.assign(new Error('Check the date on your phone, then try again.'), { status:400 });
  data.heartDays ||= {};
  data.heartOperations ||= {};
  const receipt = `${change.from}|${count}|${day}`;
  const previous = data.heartOperations[change.operationId];
  if (previous) {
    if (previous !== receipt && (change.day || !previous.startsWith(`${change.from}|${count}|`))) throw Object.assign(new Error('This heart was already saved with a different count.'), { status:409 });
    return false;
  }
  // Old clients have no receipt ledger; their last saved heart is still idempotent.
  if (data.hearts[change.from]?.id === change.operationId) return false;
  const values = data.heartDays[day] ||= {me:0,asechka:0};
  if (!Number.isSafeInteger((values[change.from] || 0) + count)) throw Object.assign(new Error('This heart count could not be saved.'), {status:400});
  values[change.from] = (values[change.from] || 0) + count;
  data.heartOperations[change.operationId] = receipt;
  data.hearts[change.from] = {id:change.operationId,sentAt:now.toISOString()};
  return true;
}
export function saveSharedStreak(data, now = new Date()) {
  data.heartStreak = streakPolicy(data.heartStreak);
  data.streakStatus = { ...sharedStreak(data, heartDay(now)), asOf: now.toISOString() };
}
export function publicTogether(data, now = new Date(), operation = '') {
  const {heartOperations,...visible} = data;
  const receipt=heartOperations?.[operation]?.split('|');
  const heartReceipt=receipt?.length===3 ? {operationId:operation,from:receipt[0],count:Number(receipt[1]),day:receipt[2]} : null;
  return {...visible,heartStreak:streakPolicy(data.heartStreak),streakStatus:{...sharedStreak(data,heartDay(now)),asOf:now.toISOString()},heartReceipts:Object.keys(heartOperations || {}).slice(-512),...(operation ? {heartReceipt}:{})};
}
