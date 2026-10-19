import { createHash } from 'node:crypto';
import { TogetherError } from './together-store.js';
import { UUID } from './daily-memory.js';

export const socialActions = new Set(['setLike', 'addComment', 'removeComment']);
const fail = (message, status = 400) => { throw new TogetherError(message, status); };
export const contentFingerprint = item => {
  if (typeof item === 'string') return createHash('sha256').update(JSON.stringify(item)).digest('hex');
  const { social, ...content } = item;
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
};

export function checkedSocialChange(input) {
  if (!UUID.test(input.operationId || '') || !UUID.test(input.id || '') ||
      !['photo', 'quote'].includes(input.kind) || !['asnat', 'youssef'].includes(input.actor))
    fail('Open this post again before reacting.');
  const change = { action: input.action, operationId: input.operationId, id: input.id,
    kind: input.kind, actor: input.actor };
  if (input.action === 'setLike') {
    if (typeof input.liked !== 'boolean') fail('Choose whether to like this post.');
    change.liked = input.liked;
  } else if (input.action === 'addComment') {
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 1000)
      fail('Write a comment of 1 to 1,000 characters.');
    change.text = input.text.trim();
  } else {
    if (!UUID.test(input.commentId || '')) fail('Choose the comment to remove.');
    change.commentId = input.commentId;
  }
  return change;
}

export function changeSocial(data, change, keyFor, now) {
  const kind = change.kind === 'photo' ? 'photos' : 'quotes';
  const index = data[kind].findIndex((item, i) => keyFor(item, i, kind) === change.id);
  if (index < 0) fail('This post was removed. Your comment has not been shared.', 409);
  const previous = data[kind][index];
  const item = typeof previous === 'string' ? { text: previous, id: change.id } : previous;
  item.id ||= change.id;
  const social = item.social ||= { likes: {}, comments: [], receipts: [] };
  social.likes ||= {}; social.comments ||= []; social.receipts ||= [];
  const hash = createHash('sha256').update(JSON.stringify(change)).digest('hex');
  const receipt = social.receipts.find(receipt => receipt.id === change.operationId);
  if (receipt) {
    if (receipt.hash !== hash) fail('This reaction changed. Please try it again.', 409);
    return { data, changed: false };
  }
  if (change.action === 'setLike') social.likes[change.actor] = change.liked;
  else if (change.action === 'addComment') {
    const existing = social.comments.find(comment => comment.id === change.operationId);
    if (existing && (existing.text !== change.text || existing.author !== change.actor))
      fail('This comment changed. Please try it again.', 409);
    if (!existing) {
      if (social.comments.length >= 500) fail('This conversation is full. Make a little room first.', 409);
      social.comments.push({ id: change.operationId, author: change.actor,
        text: change.text, createdAt: now.toISOString() });
    }
  } else {
    const comment = social.comments.find(comment => comment.id === change.commentId);
    if (comment && comment.author !== change.actor) fail('Choose one of your own comments to remove.', 403);
    social.comments = social.comments.filter(comment => comment.id !== change.commentId);
  }
  social.receipts.push({ id: change.operationId, hash });
  social.receipts = social.receipts.slice(-128);
  data[kind][index] = item; data.updatedAt = now.toISOString();
  return { data, changed: true, item };
}
