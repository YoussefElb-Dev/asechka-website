import { createHash } from 'node:crypto';
import { checkedTrack } from './music-catalog.js';
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const photoPath = /^assets\/photos\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.(?:jpg|jpeg|png|webp)$/i;
export function dailyMemory(memories, music, now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const pool = [];
  for (const quote of memories?.quotes || []) if (UUID.test(quote.id) && typeof quote.text === 'string' && quote.text.trim() && quote.text.length <= 10000) {
    pool.push({kind:'quote',id:quote.id,text:quote.text,note:typeof quote.note === 'string' ? quote.note.slice(0,1000) : '',date:quote.date || '',href:'/quotes.html'});
  }
  for (const photo of memories?.photos || []) if (UUID.test(photo.id) && typeof photo.src === 'string' && photoPath.test(photo.src)) {
    pool.push({kind:'photo',id:photo.id,caption:typeof photo.caption === 'string' ? photo.caption.slice(0,1000) : '',date:photo.date || '',image:`/api/together-photo?kind=memory&id=${photo.id}`,href:'/pictures.html'});
  }
  for (const track of music?.tracks || []) if (checkedTrack(track) && UUID.test(track.id)) {
    pool.push({kind:'song',id:track.id,title:track.title,artist:track.artist,album:track.album,artwork:track.artworkUrl,url:track.trackUrl,note:typeof track.note === 'string' ? track.note.slice(0,500) : '',href:'/music.html'});
  }
  // A daily shuffled order is shared by both visitors and independent of source order.
  pool.sort((a,b)=>createHash('sha256').update(`${day}:${a.kind}:${a.id}`).digest('hex').localeCompare(createHash('sha256').update(`${day}:${b.kind}:${b.id}`).digest('hex')));
  return {day,memory:pool[0] || null};
}
