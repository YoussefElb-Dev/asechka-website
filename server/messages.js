import { heartDay } from './heart-counts.js';

const people = ['asnat', 'youssef'];

export function messageChange(data, change, now) {
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  if (!people.includes(change.actor)) fail('Choose who you are first.');
  const messages = data.messages ||= [];
  if (change.action === 'sendMessage') {
    if (typeof change.text !== 'string' || !change.text.trim() || change.text.length > 1000) {
      fail('Write a little message, up to 1,000 characters.');
    }
    const mode = change.mode === 'jar' ? 'jar' : 'once';
    const pinned = mode === 'jar' ? (change.pinned !== false) : false;
    const existing = messages.find(m => m.id === change.operationId);
    if (existing) {
      if (existing.from !== change.actor) fail('This message was already saved.', 409);
      return false;
    }
    const day = heartDay(now);
    if (messages.filter(m => m.from === change.actor && m.day === day).length >= 3) {
      fail('Your three messages for today are already sent. A new day starts at midnight Eastern.', 429);
    }
    const trimmed = change.text.trim();
    const preview = Array.from(trimmed.replace(/\s+/g, ' ')).slice(0, 60).join('') + (Array.from(trimmed).length > 60 ? '…' : '');
    if (pinned) {
      for (const prior of messages) if (prior.pinned) prior.pinned = false;
    }
    messages.push({
      id: change.operationId,
      from: change.actor,
      to: change.actor === 'asnat' ? 'youssef' : 'asnat',
      text: trimmed,
      preview,
      day,
      createdAt: now.toISOString(),
      closedAt: null,
      ...(mode === 'jar' ? { mode: 'jar', pinned } : {}),
    });
    return true;
  }
  if (change.action === 'pinMessage') {
    const message = messages.find(m => m.id === change.id);
    if (!message || message.mode !== 'jar' || typeof message.text !== 'string') {
      fail('Only kept Love Jar notes can be pinned.', 404);
    }
    const wantPinned = Boolean(change.pinned);
    if (Boolean(message.pinned) === wantPinned) return false;
    if (wantPinned) {
      for (const prior of messages) if (prior.pinned) prior.pinned = false;
    }
    message.pinned = wantPinned;
    return true;
  }
  const message = messages.find(m => m.id === change.id);
  if (!message || message.to !== change.actor) fail('This message belongs to the other person.', 403);
  if (message.closedAt) return false;
  message.closedAt = now.toISOString();
  // Keep Love Jar notes readable in full; close-once notes retain only a short preview.
  if (message.mode !== 'jar') {
    delete message.text;
  }
  return true;
}
