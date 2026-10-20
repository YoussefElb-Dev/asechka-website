const formatters = new Map();
function localParts(timestamp, timeZone) {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-US', { timeZone, year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'numeric', second:'numeric', hourCycle:'h23' }));
  return Object.fromEntries(formatters.get(timeZone).formatToParts(timestamp).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}
export function localDateTime(startedAt, timeZone = 'America/New_York') {
  const p = localParts(Date.parse(startedAt), timeZone), pad = n => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
export function fromLocalDateTime(value, timeZone = 'America/New_York') {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) throw new Error('Choose your beginning’s date and time.');
  const target = Date.parse(`${value}:00Z`); let guess = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = localParts(guess, timeZone), offset = target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += offset; if (!offset) break;
  }
  const iso = new Date(guess).toISOString();
  if (localDateTime(iso, timeZone) !== value) throw new Error('That local time does not exist because the clocks change. Choose another time.');
  return iso;
}
// Resolve each anniversary at the original local clock time, including daylight saving changes.
export function anniversaryAt(startedAt, months, timeZone = 'America/New_York') {
  const start = localParts(Date.parse(startedAt), timeZone);
  const targetMonth = new Date(Date.UTC(start.year, start.month - 1 + months, 1));
  const year = targetMonth.getUTCFullYear(), month = targetMonth.getUTCMonth();
  const day = Math.min(start.day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  const target = Date.UTC(year, month, day, start.hour, start.minute, start.second);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = localParts(guess, timeZone);
    const adjustment = target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += adjustment; if (!adjustment) break;
  }
  return guess;
}
export function durationParts(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return { days: Math.floor(seconds / 86400), hours: Math.floor(seconds / 3600) % 24, minutes: Math.floor(seconds / 60) % 60, seconds: seconds % 60 };
}
export function sinceUs(since, now = Date.now()) {
  const start = Date.parse(since.startedAt), tz = since.timeZone;
  if (!Number.isFinite(start) || !Number.isFinite(now)) throw new Error('Choose a valid beginning.');
  const a = localParts(start, tz), b = localParts(now, tz);
  let months = Math.max(0, (b.year - a.year) * 12 + b.month - a.month);
  if (anniversaryAt(since.startedAt, months, tz) > now) months = Math.max(0, months - 1);
  const nextMonth = anniversaryAt(since.startedAt, months + 1, tz);
  const years = Math.floor(months / 12), nextYear = anniversaryAt(since.startedAt, (years + 1) * 12, tz);
  const elapsed = durationParts(now - start);
  const milestone = months > 0 ? anniversaryAt(since.startedAt, months, tz) : start;
  const c = localParts(milestone, tz), sameDay = b.year === c.year && b.month === c.month && b.day === c.day;
  let message = elapsed.days === 0 ? 'Our first little day together. ♡' : `${elapsed.days} little days together. Still counting. ♡`;
  if (elapsed.days === 7) message = 'One whole week of us. ♡';
  if (sameDay && now >= milestone && months > 0) message = months % 12 === 0 ? (since.yearlyMessage || `${years === 1 ? 'One whole year' : `${years} whole years`} of us. ♡`) : (since.monthlyMessage || `${months === 1 ? 'One whole month' : `${months} whole months`} of us. ♡`);
  if (now < start) message = 'Our little beginning is on its way. ♡';
  return { elapsed, months, years, nextMonth, nextYear, monthly: durationParts(nextMonth - now), yearly: durationParts(nextYear - now), message };
}
