export const SURPRISE_DATE = '2026-10-16T15:00:00-04:00';
export const SURPRISE_TIMESTAMP = Date.parse(SURPRISE_DATE);
export function getCountdown(now = Date.now()) {
  const remaining = Math.max(0, Math.ceil((SURPRISE_TIMESTAMP - now) / 1000));
  return {
    days: Math.floor(remaining / 86400),
    hours: Math.floor(remaining / 3600) % 24,
    minutes: Math.floor(remaining / 60) % 60,
    seconds: remaining % 60,
    expired: now >= SURPRISE_TIMESTAMP
  };
}
