import { readFile, writeFile, mkdir, open, rename, stat, copyFile, access, unlink, rm } from 'node:fs/promises';
import { resolve, join, dirname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';

export function execute(file, args, options = {}) {
  if (/powershell(?:\.exe)?$/i.test(file)) {
    const env = { ...(options.env || process.env) };
    // PowerShell 7's module paths cannot be inherited by Windows PowerShell 5.
    delete env.PSModulePath;
    options = { ...options, env };
  }
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) { error.stderr = stderr; reject(error); }
      else resolve({ stdout, stderr });
    });
    child.stdin?.end();
  });
}
export const REMOTE = 'git@github.com:YoussefElb-Dev/asechka-website.git';
export const WEBSITE = 'https://asechka-website.vercel.app';
export const KEY_SETTINGS = 'https://github.com/YoussefElb-Dev/asechka-website/settings/keys';
export const DATA_FILE = 'dist/memories.json';
export const STATE_DIR = join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'AsechkaStudio');
const HOST_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl';

export async function exists(path) {
  try { await access(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temp, path);
}
export function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function checkedContent(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.quotes) || !Array.isArray(value.photos)) {
    throw new Error('The website needs a valid dist/memories.json file. Existing content was left untouched.');
  }
  if (value.quotes.some(q => typeof q !== 'string' && (!q || typeof q.text !== 'string')) ||
      value.photos.some(p => !p || typeof p.src !== 'string')) {
    throw new Error('A quote or photo in memories.json is invalid. Fix that file before publishing.');
  }
  return value;
}
export function mergeContent(base, pending) {
  checkedContent(base);
  const content = structuredClone(base);
  const knownIds = new Set([...content.quotes, ...content.photos].map(item => item?.id).filter(Boolean));
  let added = 0;
  for (const entry of pending) {
    if (knownIds.has(entry.id)) continue;
    const { kind, localPath, ...publicEntry } = entry;
    if (kind === 'quote') content.quotes.push(publicEntry);
    else if (kind === 'photo') content.photos.push(publicEntry);
    else throw new Error('Unknown queued entry. Nothing was published.');
    knownIds.add(entry.id);
    added++;
  }
  if (added) content.updatedAt = new Date().toISOString();
  return { content, added };
}

export class Publisher {
  constructor({ directory = STATE_DIR, git = 'git', remote = REMOTE, env = {}, onProgress = () => {} } = {}) {
    this.directory = resolve(directory);
    this.repository = join(this.directory, 'repository');
    this.queueFile = join(this.directory, 'queue.json');
    this.keyFile = join(this.directory, 'credentials', 'asechka_ed25519');
    this.sshConfig = join(this.directory, 'credentials', 'ssh_config');
    this.git = git;
    this.remote = remote;
    this.env = env;
    this.onProgress = onProgress;
  }
  async initialize() {
    await mkdir(join(this.directory, 'photos'), { recursive: true });
    if (!await exists(this.queueFile)) await atomicJson(this.queueFile, { version: 1, pending: [], lastPublished: null });
    await this.readQueue();
  }
  async lock() {
    const lockPath = join(this.directory, 'studio.lock');
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(String(process.pid));
      await handle.close();
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await readFile(lockPath, 'utf8'));
      if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('The publisher lock is damaged. Your drafts are safe.');
      let running = true;
      try { process.kill(pid, 0); } catch (problem) { if (problem.code === 'ESRCH') running = false; }
      if (running) throw new Error('Asechka Studio is already open. Please use that window.');
      await unlink(lockPath);
      return this.lock();
    }
    return async () => { try { await unlink(lockPath); } catch (error) { if (error.code !== 'ENOENT') throw error; } };
  }
  async readQueue() {
    const value = JSON.parse(await readFile(this.queueFile, 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.pending)) throw new Error('Your local queue is invalid. It was not overwritten.');
    for (const entry of value.pending) {
      if (!entry || !/^[a-f0-9-]{36}$/.test(entry.id) || !['quote', 'photo'].includes(entry.kind)) throw new Error('An entry in your local queue is invalid.');
      if (entry.kind === 'quote' && (typeof entry.text !== 'string' || !entry.text.trim())) throw new Error('A queued quote is blank.');
      if (entry.kind === 'photo' && (!/^assets\/photos\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.jpg$/.test(entry.src) ||
          !resolve(entry.localPath).startsWith(join(this.directory, 'photos') + sep))) throw new Error('A queued photo has an invalid path.');
    }
    return value;
  }
  async addQuote({ text, date = localDate(), note = '' }) {
    text = text.trim();
    if (!text || text.length > 10000) throw new Error('Write a quote between 1 and 10,000 characters.');
    if (!validDate(date)) throw new Error('Use a real date in YYYY-MM-DD format.');
    const entry = { id: randomUUID(), kind: 'quote', text, date, ...(note.trim() ? { note: note.trim() } : {}) };
    const queue = await this.readQueue();
    queue.pending.push(entry);
    await atomicJson(this.queueFile, queue);
    return entry;
  }
  async addPhoto({ jpegPath, caption = '', date = localDate() }) {
    if (!validDate(date)) throw new Error('Use a real date in YYYY-MM-DD format.');
    const info = await stat(jpegPath);
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error('This prepared photo must be no larger than 1 MB.');
    const bytes = await readFile(jpegPath);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('The prepared file must be a JPEG photo.');
    const id = randomUUID();
    const localPath = join(this.directory, 'photos', `${id}.jpg`);
    await copyFile(jpegPath, localPath);
    const entry = { id, kind: 'photo', src: `assets/photos/${date.slice(0, 4)}/${date.slice(5, 7)}/${id}.jpg`, caption: caption.trim(), date, localPath };
    const queue = await this.readQueue();
    queue.pending.push(entry);
    await atomicJson(this.queueFile, queue);
    return entry;
  }
  async prepareKey() {
    const directory = dirname(this.keyFile);
    await mkdir(directory, { recursive: true });
    if (!await exists(this.keyFile)) {
      await execute('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'Asechka Studio - private website', '-f', this.keyFile], { windowsHide: true, timeout: 20000 });
    }
    if (process.platform === 'win32') {
      // Limit the private key's NTFS access to this Windows user. No global settings change.
      const script = '$p=$env:ASECHKA_KEY_FILE;$acl=[System.IO.File]::GetAccessControl($p,[System.Security.AccessControl.AccessControlSections]::Access);$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$acl.SetAccessRuleProtection($true,$false);$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid,"FullControl","Allow")));[System.IO.File]::SetAccessControl($p,$acl)';
      await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, ASECHKA_KEY_FILE: this.keyFile }, windowsHide: true, timeout: 20000 });
    }
    const knownHosts = join(directory, 'known_hosts');
    await writeFile(knownHosts, `[ssh.github.com]:443 ${HOST_KEY}\n`, { mode: 0o600 });
    const quote = path => `"${path.replaceAll('\\', '/').replaceAll('"', '\\"')}"`;
    await writeFile(this.sshConfig, [
      'Host github.com', '  HostName ssh.github.com', '  Port 443', '  User git',
      `  IdentityFile ${quote(this.keyFile)}`, `  UserKnownHostsFile ${quote(knownHosts)}`,
      '  IdentitiesOnly yes', '  IdentityAgent none', '  BatchMode yes',
      '  StrictHostKeyChecking yes', '  HostKeyAlgorithms ssh-ed25519', '  ConnectTimeout 15', '',
    ].join('\n'), { mode: 0o600 });
    return (await readFile(this.keyFile + '.pub', 'utf8')).trim();
  }
  sshEnvironment() {
    const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
    const ssh = process.platform === 'win32' ? join(process.env.WINDIR || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe').replaceAll('\\', '/') : 'ssh';
    return { GIT_SSH_COMMAND: `${quote(ssh)} -F ${quote(this.sshConfig.replaceAll('\\', '/'))}` };
  }
  async runGit(args, cwd = this.repository) {
    const result = await execute(this.git, args, {
      cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...this.sshEnvironment(), ...this.env },
      windowsHide: true, timeout: 120000, maxBuffer: 2 * 1024 * 1024,
    });
    return result.stdout.trim();
  }
  async ensureRepository() {
    const marker = join(this.directory, 'repository-owner.json');
    if (!await exists(join(this.repository, '.git'))) {
      if (await exists(this.repository)) throw new Error('The Studio clone is incomplete. Your drafts are safe; ask for help restoring its connection.');
      this.onProgress('Connecting to your private GitHub repository...');
      const staging = join(this.directory, `clone-${randomUUID()}`);
      try {
        await this.runGit(['clone', '--single-branch', '--branch', 'main', this.remote, staging], this.directory);
        await atomicJson(marker, { path: this.repository, remote: this.remote });
        await rename(staging, this.repository);
      } catch (error) {
        if (resolve(staging).startsWith(this.directory + sep)) await rm(staging, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
    }
    const owner = JSON.parse(await readFile(marker, 'utf8'));
    if (owner.path !== this.repository || owner.remote !== this.remote || await this.runGit(['remote', 'get-url', 'origin']) !== this.remote) {
      throw new Error('This is not the Studio-owned clone. It was left untouched.');
    }
    await this.runGit(['config', 'user.name', 'YoussefElb-Dev']);
    await this.runGit(['config', 'user.email', '199689423+YoussefElb-Dev@users.noreply.github.com']);
  }
  async synchronize() {
    await this.ensureRepository();
    this.onProgress('Getting the latest saved memories...');
    await this.runGit(['fetch', 'origin', 'main']);
    // Only this dedicated, marked clone is reset. Drafts live outside it until a successful push.
    await this.runGit(['reset', '--hard', 'origin/main']);
    return checkedContent(JSON.parse(await readFile(join(this.repository, DATA_FILE), 'utf8')));
  }
  async publish() {
    const snapshot = (await this.readQueue()).pending;
    if (!snapshot.length) return { count: 0, alreadySaved: true };
    for (let attempt = 0; attempt < 3; attempt++) {
      const base = await this.synchronize();
      const { content, added } = mergeContent(base, snapshot);
      if (added) {
        const paths = [DATA_FILE];
        for (const entry of snapshot.filter(item => item.kind === 'photo')) {
          const target = join(this.repository, 'dist', entry.src);
          await mkdir(dirname(target), { recursive: true });
          await copyFile(entry.localPath, target);
          paths.push(`dist/${entry.src}`);
        }
        await atomicJson(join(this.repository, DATA_FILE), content);
        await this.runGit(['add', '--', ...paths]);
        const quotes = snapshot.filter(item => item.kind === 'quote').length;
        const photos = snapshot.filter(item => item.kind === 'photo').length;
        await this.runGit(['commit', '-m', `Save ${quotes} quote(s) and ${photos} photo(s) for Asechka`]);
        this.onProgress('Saving to GitHub and starting the website update...');
        try { await this.runGit(['push', 'origin', 'HEAD:main']); }
        catch (error) {
          // A concurrent editor may have pushed first, or a push may have arrived despite a dropped connection.
          if (attempt < 2) continue;
          throw error;
        }
      }
      const ids = new Set(snapshot.map(item => item.id));
      const queue = await this.readQueue();
      queue.pending = queue.pending.filter(item => !ids.has(item.id));
      queue.lastPublished = { at: new Date().toISOString(), count: snapshot.length, commit: await this.runGit(['rev-parse', 'HEAD']) };
      await atomicJson(this.queueFile, queue);
      return { count: snapshot.length, alreadySaved: added === 0, ...queue.lastPublished };
    }
  }
}
