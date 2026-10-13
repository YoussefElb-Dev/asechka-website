import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execute } from '../publisher/core.mjs';

const publisherDirectory = fileURLToPath(new URL('../publisher/', import.meta.url));

function launch(command, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(join(process.env.SystemRoot, 'System32', 'cmd.exe'), ['/d', '/s', '/c', `"${command}"`], {
      cwd, env, windowsHide: true, windowsVerbatimArguments: true, stdio: 'pipe',
    });
    let output = '';
    let errorOutput = '';
    let answered = false;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Launcher did not reach its menu: ${output}\n${errorOutput}`));
    }, 20000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (!answered && output.includes('Choose: ')) {
        answered = true;
        child.stdin.end('0\r\n');
      } else if (!answered && output.includes('Press any key')) {
        answered = true;
        child.stdin.end('\r\n');
      }
    });
    child.stderr.on('data', chunk => { errorOutput += chunk.toString(); });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => { clearTimeout(timeout); resolve({ code, output, errorOutput }); });
  });
}

test('the desktop launcher opens the real menu without Node or Git on PATH, from either working directory', { skip: process.platform !== 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'asechka-launcher-'));
  t.after(async () => {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected cleanup path');
    await rm(directory, { recursive: true, force: true });
  });
  const localAppData = join(directory, 'Local App Data');
  const state = join(localAppData, 'AsechkaStudio');
  await mkdir(state, { recursive: true });
  const git = (await execute('where.exe', ['git.exe'], { windowsHide: true })).stdout.trim().split(/\r?\n/)[0];
  await writeFile(join(state, 'runtime.cmd'), `@echo off\r\nset "ASECHKA_NODE=${process.execPath}"\r\nset "ASECHKA_GIT=${git}"\r\n`);
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(path|localappdata|asechka_node|asechka_git|psmodulepath)$/i.test(key)) delete env[key];
  }
  env.PATH = join(process.env.SystemRoot, 'System32');
  env.LOCALAPPDATA = localAppData;
  for (const [command, cwd] of [
    [`"${join(publisherDirectory, 'Start Asechka Studio.cmd')}"`, directory],
    ['"Start Asechka Studio.cmd"', publisherDirectory],
  ]) {
    const result = await launch(command, cwd, env);
    assert.equal(result.code, 0, result.output + result.errorOutput);
    assert.equal(result.errorOutput, '');
    assert.match(result.output, /1  Add a quote/);
    assert.match(result.output, /2  Add pictures/);
    assert.match(result.output, /See you soon\. Your drafts are saved\./);
    assert.deepEqual(JSON.parse(await readFile(join(state, 'queue.json'), 'utf8')).pending, []);
    await assert.rejects(access(join(state, 'studio.lock')), { code: 'ENOENT' });
  }
});
