import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink, access } from 'node:fs/promises';
import { dirname, join, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Publisher, atomicJson, checkedContent, localDate, validDate, execute, WEBSITE, STATE_DIR, DATA_FILE } from './core.mjs';
import { imageTask } from './studio.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const empty = () => ({ version: 1, quotes: [], photos: [] });
const equal = (left, right) => {
  if (typeof left !== 'string') return false;
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const publicEntry = ({ localPath, kind, ...entry }) => entry;
const errorMessage = error => {
  const detail = `${error.message || ''} ${error.stderr || ''}`;
  if (/publickey|Permission denied/i.test(detail)) return 'GitHub needs to be reconnected. Your memories are saved here; the terminal’s Connect GitHub option can restore access.';
  if (/resolve|timed out|ENOTFOUND|Network|ECONN/i.test(detail)) return 'Could not reach GitHub. Your memories are safe on this computer. Try Publish pending when you are online.';
  if (/Command failed:.*git|fatal:|repository.*exist/i.test(detail)) return 'GitHub could not be updated. Your memories are saved on this computer. Check the connection, then choose Publish pending.';
  return (error.message || 'Something went wrong. Your saved drafts are safe.').split('\n').filter(Boolean).slice(-1)[0].slice(0, 280);
};

export async function createStudioApp({ studio = new Publisher({ git: process.env.ASECHKA_GIT || 'git' }), prepareKey = true, idleMilliseconds = 180000 } = {}) {
  await studio.initialize();
  const token = randomBytes(32).toString('base64url');
  let release;
  let lockAttempt;
  let prepared = !prepareKey;
  let busy = false;
  let progress = '';
  let lastActivity = Date.now();
  let origin;
  let stopping;
  studio.onProgress = text => { progress = text; };
  async function getLock() {
    if (release) return true;
    if (!lockAttempt) lockAttempt = (async () => {
      try { release = await studio.lock(); return true; }
      catch (error) { if (/already open/.test(error.message)) return false; throw error; }
      finally { lockAttempt = null; }
    })();
    return lockAttempt;
  }
  async function prepare() {
    if (!prepared) { await studio.prepareKey(); prepared = true; }
  }
  async function content() {
    try { return checkedContent(JSON.parse(await readFile(join(studio.repository, DATA_FILE), 'utf8'))); }
    catch (error) { if (error.code === 'ENOENT') return empty(); throw error; }
  }
  async function view() {
    const writable = await getLock();
    const queue = await studio.readQueue();
    let saved = empty();
    let historyError = '';
    try { saved = await content(); } catch { historyError = 'The saved album could not be read. Your pending memories are still safe.'; }
    const quotes = [
      ...queue.pending.filter(e => e.kind === 'quote').map(e => ({ ...publicEntry(e), pending: true })),
      ...[...saved.quotes].reverse().map(e => typeof e === 'string' ? { text: e } : publicEntry(e)),
    ];
    const photos = [
      ...queue.pending.filter(e => e.kind === 'photo').map(e => ({ ...publicEntry(e), pending: true, preview: `/api/photo/pending/${encodeURIComponent(e.id)}` })),
      ...saved.photos.map((e, index) => ({ ...publicEntry(e), preview: `/api/photo/saved/${index}` })).reverse(),
    ];
    return { writable, busy, progress, historyError, today: localDate(), pending: queue.pending.length, lastPublished: queue.lastPublished,
      savedQuotes: saved.quotes.length, savedPhotos: saved.photos.length, quotes, photos, website: WEBSITE };
  }
  async function publish() {
    try {
      const result = await studio.publish();
      progress = result.count ? 'Saved to GitHub. The website is updating.' : 'Everything is already saved.';
      return { published: true, count: result.count, message: progress };
    } catch (error) {
      progress = errorMessage(error);
      return { published: false, message: progress };
    }
  }
  async function exclusive(action) {
    if (busy) throw Object.assign(new Error('An update is already running. Please wait a moment.'), { status: 409 });
    if (!await getLock()) throw Object.assign(new Error('Close the old Asechka Studio terminal to start editing in this window.'), { status: 409 });
    if (busy) throw Object.assign(new Error('An update is already running. Please wait a moment.'), { status: 409 });
    busy = true;
    try { await prepare(); return await action(); }
    finally { busy = false; lastActivity = Date.now(); }
  }
  async function body(req) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('Use JSON for this request.'), { status: 415 });
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 32 * 1024 * 1024) throw Object.assign(new Error('Choose up to 20 pictures at a time.'), { status: 413 });
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('The request was incomplete. Please try again.'), { status: 400 }); }
  }
  const headers = {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  };
  const server = createServer(async (req, res) => {
    const send = (status, value, type = 'application/json; charset=utf-8', extra = {}) => {
      res.writeHead(status, { ...headers, 'Content-Type': type, ...extra });
      res.end(req.method === 'HEAD' ? undefined : type.startsWith('application/json') ? JSON.stringify(value) : value);
    };
    try {
      if (req.headers.host !== new URL(origin).host) return send(403, { error: 'This window is local to your computer.' });
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && url.pathname === '/' && equal(url.searchParams.get('launch'), token)) {
        lastActivity = Date.now();
        return send(303, '', 'text/plain', { Location: '/', 'Set-Cookie': `asechka_studio=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400` });
      }
      const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(part => part.trim().split('=')));
      const authenticated = equal(cookies.asechka_studio, token) || equal(req.headers.authorization, `Bearer ${token}`);
      if (!authenticated) return send(401, { error: 'Open Asechka Studio using your desktop shortcut.' });
      if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'This action must come from your Studio window.' });
      if (req.method === 'GET' && url.pathname === '/api/ping') return send(200, { app: 'asechka-studio', pid: process.pid });
      lastActivity = Date.now();
      if (req.method === 'GET' && url.pathname === '/api/status') return send(200, await view());
      if (req.method === 'GET' && ['/','/gui.css','/gui.js','/cat.jpg'].includes(url.pathname)) {
        const files = { '/': ['gui/index.html', 'text/html; charset=utf-8'], '/gui.css': ['gui/gui.css', 'text/css; charset=utf-8'], '/gui.js': ['gui/gui.js', 'text/javascript; charset=utf-8'], '/cat.jpg': ['../dist/assets/cats-cuddle.jpg', 'image/jpeg'] };
        const [path, type] = files[url.pathname];
        return send(200, await readFile(join(directory, path)), type);
      }
      const photoMatch = /^\/api\/photo\/(pending|saved)\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'GET' && photoMatch) {
        let path;
        if (photoMatch[1] === 'pending') {
          const entry = (await studio.readQueue()).pending.find(e => e.kind === 'photo' && e.id === decodeURIComponent(photoMatch[2]));
          if (entry) path = entry.localPath;
        } else if (/^\d+$/.test(photoMatch[2])) {
          const entry = (await content()).photos[Number(photoMatch[2])];
          const root = resolve(studio.repository, 'dist');
          if (entry) {
            const candidate = resolve(root, entry.src);
            if (candidate.startsWith(root + sep)) path = candidate;
          }
        }
        if (!path) return send(404, { error: 'Picture not found.' });
        const type = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[extname(path).toLowerCase()] || 'image/jpeg';
        return send(200, await readFile(path), type);
      }
      if (req.method === 'POST' && req.headers['x-asechka-studio'] === '1') {
        const data = await body(req);
        if (url.pathname === '/api/quote') {
          if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 10000 || !validDate(data.date) || typeof data.note !== 'string' || data.note.length > 1000) throw Object.assign(new Error('Write your quote and choose a valid date.'), { status: 400 });
          const result = await exclusive(async () => {
            progress = 'Saving your words…';
            await studio.addQuote(data);
            return { saved: true, ...await publish() };
          });
          return send(200, result);
        }
        if (url.pathname === '/api/photos') {
          if (!Array.isArray(data.photos) || !data.photos.length || data.photos.length > 20) throw Object.assign(new Error('Choose between 1 and 20 pictures.'), { status: 400 });
          const photos = data.photos.map(photo => {
            if (!photo || typeof photo.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data) || photo.data.length > 1400000 || typeof photo.caption !== 'string' || photo.caption.length > 1000 || !validDate(photo.date)) throw Object.assign(new Error('A picture or its date is invalid.'), { status: 400 });
            const jpeg = Buffer.from(photo.data, 'base64');
            if (jpeg.length > 1024 * 1024 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw Object.assign(new Error('This picture could not be prepared. Please choose it again.'), { status: 400 });
            return { ...photo, jpeg };
          });
          const result = await exclusive(async () => {
            let saved = 0;
            const savedIndices = [];
            const problems = [];
            for (const [index, photo] of photos.entries()) {
              progress = `Preparing picture ${saved + 1} of ${photos.length}…`;
              const input = join(studio.directory, 'photos', `upload-${randomUUID()}.jpg`);
              const output = join(studio.directory, 'photos', `prepared-${randomUUID()}.jpg`);
              try {
                await writeFile(input, photo.jpeg);
                await imageTask({ mode: 'resize', source: input, destination: output }, studio.directory);
                await studio.addPhoto({ jpegPath: output, caption: photo.caption, date: photo.date });
                saved++;
                savedIndices.push(index);
              } catch (error) { problems.push(errorMessage(error)); }
              finally { await unlink(input).catch(() => {}); await unlink(output).catch(() => {}); }
            }
            if (!saved) throw Object.assign(new Error(problems[0] || 'No pictures were saved.'), { status: 400 });
            return { saved: true, savedCount: saved, savedIndices, problems, ...await publish() };
          });
          return send(200, result);
        }
        if (url.pathname === '/api/publish') return send(200, await exclusive(publish));
        if (url.pathname === '/api/refresh') {
          const result = await exclusive(async () => {
            try { await studio.synchronize(); progress = 'Your saved album is up to date.'; return { refreshed: true, message: progress }; }
            catch (error) { progress = errorMessage(error); return { refreshed: false, message: progress }; }
          });
          return send(200, result);
        }
      }
      return send(404, { error: 'This action is not available.' });
    } catch (error) { if (!res.headersSent) send(error.status || 500, { error: errorMessage(error) }); else res.end(); }
  });
  let timer;
  async function stop() {
    if (stopping) return stopping;
    stopping = (async () => {
      clearInterval(timer);
      server.closeIdleConnections();
      await new Promise(resolve => server.close(resolve));
      if (release) { await release(); release = null; }
    })();
    return stopping;
  }
  async function start(port = 43125) {
    await new Promise((resolve, reject) => {
      const fail = error => { server.off('listening', success); reject(error); };
      const success = () => { server.off('error', fail); resolve(); };
      server.once('error', fail); server.once('listening', success); server.listen(port, '127.0.0.1');
    });
    origin = `http://127.0.0.1:${server.address().port}`;
    timer = setInterval(() => { if (!busy && Date.now() - lastActivity > idleMilliseconds) void stop(); }, Math.min(15000, idleMilliseconds));
    timer.unref();
    return { origin, launchUrl: `${origin}/?launch=${token}` };
  }
  return { server, token, start, stop, view };
}

async function openWindow(url) {
  const candidates = [
    join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  for (const file of candidates) {
    try { await access(file); } catch { continue; }
    const child = spawn(file, [`--app=${url}`, '--window-size=1180,850'], { detached: true, stdio: 'ignore', windowsHide: false });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
    return;
  }
  await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:ASECHKA_OPEN_URL'], { env: { ...process.env, ASECHKA_OPEN_URL: url }, windowsHide: true });
}

async function main() {
  const instanceFile = join(STATE_DIR, 'gui-instance.json');
  if (process.env.ASECHKA_GUI_NO_OPEN !== '1') {
    try {
      const instance = JSON.parse(await readFile(instanceFile, 'utf8'));
      if (Number.isInteger(instance.port) && instance.port > 0 && instance.port <= 65535 && /^[\w-]{43}$/.test(instance.token)) {
        const origin = `http://127.0.0.1:${instance.port}`;
        const response = await fetch(`${origin}/api/ping`, { headers: { Authorization: `Bearer ${instance.token}` }, signal: AbortSignal.timeout(1500) });
        const ping = await response.json();
        if (response.ok && ping.app === 'asechka-studio' && ping.pid === instance.pid) { await openWindow(`${origin}/?launch=${instance.token}`); return; }
      }
    } catch { /* An old window has closed; start a fresh local session. */ }
  }
  const app = await createStudioApp();
  let location;
  try { location = await app.start(Number(process.env.ASECHKA_GUI_PORT || 43125)); }
  catch (error) { if (error.code !== 'EADDRINUSE') throw error; location = await app.start(0); }
  await atomicJson(instanceFile, { pid: process.pid, port: Number(new URL(location.origin).port), token: app.token });
  app.server.once('close', () => { void (async () => {
    try { if (JSON.parse(await readFile(instanceFile, 'utf8')).pid === process.pid) await unlink(instanceFile); } catch { /* Already cleaned up. */ }
  })(); });
  process.once('SIGINT', () => void app.stop());
  process.once('SIGTERM', () => void app.stop());
  if (process.env.ASECHKA_GUI_NO_OPEN !== '1') {
    try { await openWindow(location.launchUrl); }
    catch (error) { await app.stop(); throw error; }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { await main(); }
  catch (error) {
    const script = 'Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.MessageBox]::Show($env:ASECHKA_GUI_ERROR,"Asechka Studio") | Out-Null';
    await execute('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { env: { ...process.env, ASECHKA_GUI_ERROR: errorMessage(error) }, windowsHide: true }).catch(() => {});
    process.exitCode = 1;
  }
}
