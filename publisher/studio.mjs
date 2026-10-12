import { createInterface } from 'node:readline/promises';
import { readFile, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Publisher, atomicJson, localDate, validDate, execute, WEBSITE, KEY_SETTINGS } from './core.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const color = process.stdout.isTTY;
const blue = text => color ? `\x1b[96m${text}\x1b[0m` : text;
const lavender = text => color ? `\x1b[95m${text}\x1b[0m` : text;
const muted = text => color ? `\x1b[90m${text}\x1b[0m` : text;
const studio = new Publisher({ git: process.env.ASECHKA_GIT || 'git', onProgress: text => console.log(muted(`  ${text}`)) });
let release;
let input;

export async function imageTask(request, stateDirectory) {
  const requestFile = join(stateDirectory, `image-request-${randomUUID()}.json`);
  await atomicJson(requestFile, request);
  try {
    const script = await readFile(join(directory, 'images.ps1'), 'utf8');
    const { stdout } = await execute('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      env: { ...process.env, ASECHKA_IMAGE_REQUEST: requestFile }, windowsHide: true, timeout: 600000, maxBuffer: 1024 * 1024,
    });
    return JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  } finally { await unlink(requestFile).catch(() => {}); }
}
function openUrl(url) {
  // Fixed HTTPS URLs, with no credentials or user text in the command.
  const script = 'Start-Process -FilePath $env:ASECHKA_OPEN_URL';
  const child = spawn('powershell.exe', ['-NoProfile', '-Command', script], { env: { ...process.env, ASECHKA_OPEN_URL: url }, windowsHide: true, stdio: 'ignore', detached: true });
  child.on('error', () => console.log(`Open ${url} in your browser.`));
  child.unref();
}
async function askDate() {
  const answer = (await input.question(`  Date [${localDate()}]: `)).trim() || localDate();
  if (!validDate(answer)) throw new Error('Please use a real date in YYYY-MM-DD format.');
  return answer;
}
async function publish() {
  const count = (await studio.readQueue()).pending.length;
  if (!count) { console.log(blue('  Everything you added has been saved.')); return; }
  try {
    const result = await studio.publish();
    console.log(blue(`\n  Saved ${result.count} ${result.count === 1 ? 'memory' : 'memories'} to your private GitHub.`));
    console.log('  Vercel is updating the website. This usually takes a short moment.');
    console.log('  An open website checks for new memories every 15 seconds.');
  } catch (error) {
    console.log(lavender('\n  Saved on this computer. Publishing could not finish yet.'));
    if (/publickey|Permission denied/.test(`${error.message} ${error.stderr || ''}`)) {
      console.log('  Connect GitHub with option 5, then retry with option 3.');
    } else if (/Could not resolve|timed out|ENOTFOUND|Network is unreachable/.test(error.message)) {
      console.log('  Check your internet connection, then use option 3.');
    } else {
      console.log(`  ${error.message.split('\n').filter(Boolean).slice(-1)[0].slice(0, 300)}`);
      console.log('  Your pending quotes and pictures are safe. Use option 3 to retry.');
    }
  }
}
async function quote() {
  console.log('\n  Write your quote. For more than one line, type /multi.');
  let text = await input.question('  Quote (blank cancels): ');
  if (text.trim() === '/multi') {
    console.log('  Write as many lines as you like. A line containing only . finishes.');
    const lines = [];
    while (true) {
      const line = await input.question('  > ');
      if (line === '.') break;
      lines.push(line);
    }
    text = lines.join('\n');
  }
  if (!text.trim()) return;
  const date = await askDate();
  const note = await input.question('  Little note (optional): ');
  await studio.addQuote({ text, date, note });
  console.log(blue('  Quote saved locally.'));
  await publish();
}
async function pictures() {
  console.log('\n  Choose one or more JPG, PNG, BMP or TIFF pictures.');
  console.log('  For HEIC pictures, export them as JPG first.');
  const files = await imageTask({ mode: 'pick' }, studio.directory);
  if (!files.length) { console.log('  No pictures selected.'); return; }
  let added = 0;
  for (const file of files) {
    console.log(lavender(`\n  ${basename(file)}`));
    const caption = await input.question('  Caption (optional): ');
    let date;
    try { date = await askDate(); } catch (error) { console.log(`  ${error.message} Skipping this picture.`); continue; }
    const jpegPath = join(studio.directory, 'photos', `prepared-${randomUUID()}.jpg`);
    try {
      const image = await imageTask({ mode: 'resize', source: file, destination: jpegPath }, studio.directory);
      await studio.addPhoto({ jpegPath, caption, date });
      console.log(blue(`  Saved locally: ${image.width} x ${image.height}, ${Math.ceil(image.bytes / 1024)} KB.`));
      added++;
    } catch (error) { console.log(`  Could not prepare this photo: ${(error.stderr || error.message).split('\n').filter(Boolean)[0].slice(0, 200)}`); }
    finally { await unlink(jpegPath).catch(() => {}); }
  }
  if (added) await publish();
}
async function connection() {
  const key = await studio.prepareKey();
  console.log('\n  One-time GitHub connection for this website only.');
  console.log('  On the page: Add deploy key -> title "Asechka Studio".');
  console.log('  Paste this PUBLIC key and check "Allow write access":\n');
  console.log(`  ${key}\n`);
  console.log('  The private key stays on this Windows account. Never upload it.');
  console.log('  You can revoke this connection from the repo Settings -> Deploy keys.');
  openUrl(KEY_SETTINGS);
  await input.question('  After adding the key, press Enter to check the connection...');
  await studio.ensureRepository();
  console.log(blue('  Connected to your private GitHub repository.'));
  if ((await studio.readQueue()).pending.length) await publish();
}
async function status() {
  const queue = await studio.readQueue();
  console.log(`\n  Waiting to publish: ${queue.pending.length}`);
  if (queue.lastPublished) console.log(`  Last GitHub save: ${new Date(queue.lastPublished.at).toLocaleString()}`);
  console.log(`  Local drafts: ${studio.directory}`);
  console.log(`  Website: ${WEBSITE}`);
  for (const entry of queue.pending) console.log(`  ${entry.kind === 'quote' ? 'Quote' : 'Photo'}: ${String(entry.text || entry.caption || 'A moment with you').replaceAll('\n', ' ').slice(0, 100)}`);
}
async function main() {
  await studio.initialize();
  release = await studio.lock();
  input = createInterface({ input: process.stdin, output: process.stdout });
  if (process.stdout.isTTY) process.stdout.write('\x1b]0;Asechka Studio\x07');
  await studio.prepareKey();
  console.log(blue('\n  /\\_/\\   A S E C H K A   S T U D I O'));
  console.log(lavender(' ( o.o )  A little place for your words and pictures.'));
  console.log(muted('  > ^ <   Private GitHub + Vercel Hobby. No paid services.\n'));
  const pending = (await studio.readQueue()).pending.length;
  if (pending) console.log(lavender(`  ${pending} saved ${pending === 1 ? 'memory is' : 'memories are'} waiting to publish. Use option 3.`));
  while (true) {
    console.log('\n  1  Add a quote\n  2  Add pictures\n  3  Publish pending memories\n  4  Status / saved drafts\n  5  Connect GitHub\n  6  Open the website\n  0  Close');
    const choice = (await input.question(blue('\n  Choose: '))).trim();
    try {
      if (choice === '0') break;
      if (choice === '1') await quote();
      else if (choice === '2') await pictures();
      else if (choice === '3') await publish();
      else if (choice === '4') await status();
      else if (choice === '5') await connection();
      else if (choice === '6') openUrl(WEBSITE);
      else console.log('  Pick a number from the menu.');
    } catch (error) { console.log(lavender(`\n  ${error.message.split('\n').filter(Boolean).slice(-1)[0].slice(0, 300)}`)); }
  }
  console.log(blue('\n  See you soon. Your drafts are saved.\n'));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { await main(); }
  catch (error) { console.error(`\n  ${error.message}`); process.exitCode = 1; }
  finally { input?.close(); if (release) await release(); }
}
