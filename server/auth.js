import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { gatePage } from './gate.js';

const COOKIE = 'asechka_session';
const LIFETIME = 7 * 24 * 60 * 60;
export const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};
function settings() {
  const password = process.env.SITE_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret || secret.length < 32) return null;
  return { password, key: createHash('sha256').update(secret + '\0' + password).digest() };
}
function signature(payload, key) { return createHmac('sha256', key).update(payload).digest('base64url'); }
function equal(a, b) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
export function sessionToken(key, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + LIFETIME}.${randomBytes(18).toString('base64url')}`;
  return `${payload}.${signature(payload, key)}`;
}
export function validSession(cookieHeader, key, now = Date.now()) {
  const cookie = (cookieHeader || '').split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='));
  if (!cookie) return false;
  const token = cookie.slice(COOKIE.length + 1);
  if (!/^\d{10}\.[\w-]{24}\.[\w-]{43}$/.test(token)) return false;
  const [expiry, nonce, signed] = token.split('.');
  const seconds = Math.floor(now / 1000);
  return Number(expiry) > seconds && Number(expiry) <= seconds + LIFETIME && equal(signed, signature(`${expiry}.${nonce}`, key));
}
function cookieValue(token, request, expires = LIFETIME) {
  const secure = new URL(request.url).protocol === 'https:' || process.env.VERCEL;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expires}${secure ? '; Secure' : ''}`;
}
function response(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...privateHeaders, ...extra } });
}
function redirect(path, extra = {}) { return response(null, 303, { Location: path, ...extra }); }

// A per-instance throttle supplements the failed-attempt delay.
// This is not a distributed rate limiter.
const attempts = new Map();
function allowedAttempt(request) {
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
  if (attempts.size > 2000) attempts.clear();
  const entry = attempts.get(ip) || { count: 0, until: now + 60_000 };
  entry.count++;
  attempts.set(ip, entry);
  return entry.count <= 10;
}
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  return !origin || origin === new URL(request.url).origin;
}

// Null means the request may proceed to static files. All paths are checked.
export async function authorize(request) {
  let path;
  try { path = decodeURIComponent(new URL(request.url).pathname); }
  catch { return response('Bad request', 400); }
  const json = request.headers.get('accept')?.includes('application/json');
  const auth = settings();
  const signedIn = auth && validSession(request.headers.get('cookie'), auth.key);
  if (path === '/gate.css' || path === '/gate.js' || path === '/assets/favicon.svg') return null;
  if (path === '/robots.txt') return response('User-agent: *\nDisallow: /\n', 200, { 'Content-Type': 'text/plain' });
  if (path === '/api/session' || path === '/api/logout') {
    if (request.method !== 'POST') return response('Method not allowed', 405, { Allow: 'POST' });
    if (!sameOrigin(request)) return response('Forbidden', 403);
    if (path === '/api/logout') return redirect('/login', { 'Set-Cookie': cookieValue('', request, 0) });
    if (!auth) return response(json ? JSON.stringify({ error: 'Our little door isn’t ready yet. Try again soon.' }) : gatePage('login', 'Our little door isn’t ready yet. Try again soon.'), 503, { 'Content-Type': json ? 'application/json' : 'text/html; charset=utf-8' });
    if (!allowedAttempt(request)) return response(json ? JSON.stringify({ error: 'A few too many guesses. Give it a minute, love.' }) : gatePage('login', 'A few too many guesses. Give it a minute, love.'), 429, { 'Content-Type': json ? 'application/json' : 'text/html; charset=utf-8', 'Retry-After': '60' });
    if (Number(request.headers.get('content-length') || 0) > 1024) return response('Too much data', 413);
    let input;
    try {
      const raw = await request.text();
      if (raw.length > 1024) return response('Too much data', 413);
      input = new URLSearchParams(raw).get('password') || '';
    } catch { return response('Bad request', 400); }
    if (!equal(input, auth.password)) {
      await new Promise(resolve => setTimeout(resolve, 600));
      const error = 'Not quite, love. Try our little code again.';
      return response(json ? JSON.stringify({ error }) : gatePage('login', error), 401, { 'Content-Type': json ? 'application/json' : 'text/html; charset=utf-8' });
    }
    const cookie = cookieValue(sessionToken(auth.key), request);
    return json ? response(JSON.stringify({ location: '/welcome' }), 200, { 'Content-Type': 'application/json', 'Set-Cookie': cookie }) : redirect('/welcome', { 'Set-Cookie': cookie });
  }
  if (path === '/login' || path === '/login.html') {
    if (signedIn) return redirect('/welcome');
    return response(gatePage('login'), 200, { 'Content-Type': 'text/html; charset=utf-8' });
  }
  if (!auth) return response(gatePage('login', 'Our little door isn’t ready yet. Try again soon.'), 503, { 'Content-Type': 'text/html; charset=utf-8' });
  if (!signedIn) return path === '/api/music' || path === '/api/music-search' ? response(JSON.stringify({ error: 'Unlock our little door again to see our music.' }), 401, { 'Content-Type': 'application/json' }) : redirect('/login');
  if (path === '/welcome') return response(gatePage('welcome'), 200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (path === '/api/music' && request.method === 'POST') {
    if (!sameOrigin(request) || request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('x-asechka-music') !== '1' || !request.headers.get('content-type')?.startsWith('application/json')) return response(JSON.stringify({ error: 'Please choose our songs from the music page.' }), 403, { 'Content-Type': 'application/json' });
    return null;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return response('Method not allowed', 405, { Allow: 'GET, HEAD' });
  return null;
}
