import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { authorize, privateHeaders } from './server/auth.js';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const directory = resolve('dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif' };
const port = Number(process.env.PORT || 4173);
try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
createServer(async (req, res) => {
  try {
    const request = new Request(new URL(req.url, `http://127.0.0.1:${port}`), {
      method: req.method, headers: req.headers,
      ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Readable.toWeb(req), duplex: 'half' }),
    });
    const gate = await authorize(request);
    if (gate) {
      res.writeHead(gate.status, Object.fromEntries(gate.headers));
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await gate.arrayBuffer()));
      return;
    }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(directory + sep)) { res.writeHead(403); res.end(); return; }
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', ...privateHeaders });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
