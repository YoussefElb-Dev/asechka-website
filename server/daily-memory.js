import { createHash } from 'node:crypto';
import { checkedTrack } from './music-catalog.js';

export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const photoPath = /^assets\/photos\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp)$/i;

function daysBetween(olderDay, newerDay) {
  const a = Date.parse(olderDay + 'T12:00:00Z');
  const b = Date.parse(newerDay + 'T12:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return -1;
  return Math.round((b - a) / 86_400_000);
}

function throwbackLabel(itemDate, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(itemDate || '') || itemDate >= today) return '';
  const diff = daysBetween(itemDate, today);
  if (diff <= 0) return '';
  const [ty, tm, td] = today.split('-').map(Number);
  const [iy, im, id] = itemDate.split('-').map(Number);
  if (tm === im && td === id && ty > iy) {
    const yrs = ty - iy;
    return yrs === 1 ? '1 year ago today' : `${yrs} years ago today`;
  }
  if (td === id) {
    const months = (ty - iy) * 12 + (tm - im);
    if (months >= 1) return months === 1 ? '1 month ago today' : `${months} months ago today`;
  }
  if (diff === 7) return 'A week ago today';
  if (diff === 14) return 'Two weeks ago';
  if (diff === 30) return '30 days ago';
  return '';
}

export function dailyMemory(memories, music, now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const pool = [];
  const throwbacks = [];

  for (const quote of memories?.quotes || []) {
    if (UUID.test(quote.id) && typeof quote.text === 'string' && quote.text.trim() && quote.text.length <= 10000) {
      const item = { kind: 'quote', id: quote.id, text: quote.text, note: typeof quote.note === 'string' ? quote.note.slice(0, 1000) : '', date: quote.date || '', href: '/quotes.html' };
      pool.push(item);
      const label = throwbackLabel(item.date, day);
      if (label) throwbacks.push({ ...item, throwbackLabel: label });
    }
  }
  for (const photo of memories?.photos || []) {
    if (UUID.test(photo.id) && typeof photo.src === 'string' && photoPath.test(photo.src)) {
      const item = { kind: 'photo', id: photo.id, caption: typeof photo.caption === 'string' ? photo.caption.slice(0, 1000) : '', date: photo.date || '', image: `/api/together-photo?kind=memory&id=${photo.id}`, href: '/pictures.html' };
      pool.push(item);
      const label = throwbackLabel(item.date, day);
      if (label) throwbacks.push({ ...item, throwbackLabel: label });
    }
  }
  for (const track of music?.tracks || []) {
    if (checkedTrack(track) && UUID.test(track.id)) {
      pool.push({ kind: 'song', id: track.id, title: track.title, artist: track.artist, album: track.album, artwork: track.artworkUrl, url: track.trackUrl, note: typeof track.note === 'string' ? track.note.slice(0, 500) : '', href: '/music.html' });
    }
  }
  // A daily shuffled order is shared by both visitors and independent of source order.
  const rank = item => createHash('sha256').update(`${day}:${item.kind}:${item.id}`).digest('hex');
  pool.sort((a, b) => rank(a).localeCompare(rank(b)));
  throwbacks.sort((a, b) => rank(a).localeCompare(rank(b)));
  return { day, memory: pool[0] || null, throwback: throwbacks[0] || null };
}
