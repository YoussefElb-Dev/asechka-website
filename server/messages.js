import { heartDay } from './heart-counts.js';
const people = ['asnat', 'youssef'];
export function messageChange(data, change, now) {
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  if (!people.includes(change.actor)) fail('Choose who you are first.');
  const messages = data.messages ||= [];
  if (change.action === 'sendMessage') {
    if (typeof change.text !== 'string' || !change.text.trim() || change.text.length > 1000) fail('Write a little message, up to 1,000 characters.');
    const existing = messages.find(m => m.id === change.operationId);
    if (existing) {
      if (existing.from !== change.actor) fail('This message was already saved.', 409);
      return false;
    }
    const day = heartDay(now);
    if (messages.filter(m => m.from === change.actor && m.day === day).length >= 3) fail('Your three messages for today are already sent. A new day starts at midnight Eastern.', 429);
    messages.push({id:change.operationId, from:change.actor, to:change.actor === 'asnat' ? 'youssef' : 'asnat', text:change.text.trim(), preview:Array.from(change.text.trim().replace(/\s+/g,' ')).slice(0,60).join('') + (Array.from(change.text.trim()).length > 60 ? '…' : ''), day, createdAt:now.toISOString(), closedAt:null});
    return true;
  }
  const message = messages.find(m => m.id === change.id);
  if (!message || message.to !== change.actor) fail('This message belongs to the other person.', 403);
  if (message.closedAt) return false;
  message.closedAt = now.toISOString();
  // The API and current saved state keep only a short note after closing.
  delete message.text;
  return true;
}
