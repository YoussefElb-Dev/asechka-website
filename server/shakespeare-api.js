import { authorize, privateHeaders } from './auth.js';
import { GitHubMemoriesStore, checkedMemoryChange } from './memories-store.js';
import { TogetherError } from './together-store.js';

const MAX_BYTES = 16000;
const languages = new Set(['en', 'ar', 'arz', 'fr', 'ru', 'he', 'es', 'de', 'it', 'tr', 'ur', 'zh']);
const fields = new Set(['operationId', 'text', 'date', 'language']);
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' },
});

export function checkedShakespearePost(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => !fields.has(key))
      || typeof input.text !== 'string' || input.text.length > 2400
      || input.language !== undefined && !languages.has(input.language)) {
    throw new TogetherError('Choose a valid Shakespeare quote to keep.', 400);
  }
  // This route can only append a quote. Repository paths, author, notes and
  // mutation actions never come from the mobile request.
  return checkedMemoryChange({
    action: 'addQuote', operationId: input.operationId, text: input.text,
    date: input.date, author: 'youssef', note: 'Created with Shakespeare',
  });
}

async function readPost(request) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) {
    throw new TogetherError('This quote is too large to send.', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new TogetherError('Choose a quote to keep.', 400);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new TogetherError('This quote is too large to send.', 413);
      }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) {
    if (error instanceof TogetherError) throw error;
    throw new TogetherError('This quote could not be read. Please try again.', 400);
  } finally {
    reader.releaseLock();
  }
}

export function createShakespeareAPI({ collection = new GitHubMemoriesStore() } = {}) {
  return async request => {
    const denied = await authorize(request);
    if (denied) return denied;
    if (new URL(request.url).pathname !== '/api/shakespeare') return json({ error: 'Not found.' }, 404);
    try {
      const change = checkedShakespearePost(await readPost(request));
      if (!collection.writable) throw new TogetherError('Asechka saving is unavailable. Your quote has not been sent.');
      // GitHubMemoriesStore re-reads the current branch, preserves unrelated
      // content, retries concurrent commits and deduplicates operationId.
      const saved = await collection.change(change);
      const post = saved?.quotes?.find(item => item?.id === change.operationId);
      if (!post || post.text !== change.text || post.date !== change.date || post.note !== change.note) {
        throw new TogetherError('Asechka could not confirm this quote. Keep it and retry with the same ID.');
      }
      return json({ id: post.id, posted: true, url: 'https://asechka-website.vercel.app/quotes.html' });
    } catch (error) {
      return json({ error: error instanceof TogetherError ? error.message : 'Asechka could not confirm this quote. Keep it and try again.' },
        error instanceof TogetherError ? error.status : 503);
    }
  };
}

export const handleShakespeare = createShakespeareAPI();
