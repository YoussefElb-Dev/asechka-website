import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from './core.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const source = await readFile(join(directory, 'install-shortcut.ps1'), 'utf8');
const script = `& {\n${source}\n} -StudioDirectory $env:ASECHKA_PUBLISHER_DIRECTORY`;
const result = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
  env: { ...process.env, ASECHKA_PUBLISHER_DIRECTORY: directory }, windowsHide: true, timeout: 20000,
});
console.log(result.stdout.trim());
