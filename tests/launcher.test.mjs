import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execute } from '../publisher/core.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync } from 'node:fs';

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

for (const setup of ['missing JSON', 'damaged JSON', 'stale paths', 'fresh setup']) {
  const bundledNode = join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'bin', 'node.exe');
  test(`the GUI launcher repairs ${setup} with Node and Git absent from PATH`, {
    skip: process.platform !== 'win32' || (setup === 'fresh setup' && !existsSync(bundledNode)),
  }, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'asechka-gui-launcher-'));
    let guiPid;
    t.after(async () => {
      if (guiPid) { try { process.kill(guiPid); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
      if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected cleanup path');
      await rm(directory, { recursive: true, force: true });
    });
    const state = join(directory, 'AsechkaStudio');
    await mkdir(state, { recursive: true });
    const git = (await execute('where.exe', ['git.exe'], { windowsHide: true })).stdout.trim().split(/\r?\n/)[0];
    if (setup !== 'fresh setup') await writeFile(join(state, 'runtime.cmd'), `@echo off\r\nset "ASECHKA_NODE=${process.execPath}"\r\nset "ASECHKA_GIT=${git}"\r\n`);
    if (setup === 'damaged JSON') await writeFile(join(state, 'runtime.json'), '{unfinished');
    if (setup === 'stale paths') await writeFile(join(state, 'runtime.json'), JSON.stringify({ node: join(directory, 'old', 'node.exe'), git: join(directory, 'old', 'git.exe') }));
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(path|localappdata|asechka_node|asechka_git|asechka_gui_.*|psmodulepath)$/i.test(key)) delete env[key];
    env.PATH = join(process.env.SystemRoot, 'System32');
    env.LOCALAPPDATA = directory;
    env.ASECHKA_GUI_NO_OPEN = '1';
    env.ASECHKA_GUI_PORT = '0';
    env.ASECHKA_PUBLISHER_DIRECTORY = publisherDirectory;
    const source = await readFile(join(publisherDirectory, 'launch-gui.ps1'), 'utf8');
    const script = `& {\n${source}\n} -StudioDirectory $env:ASECHKA_PUBLISHER_DIRECTORY -NoErrorDialog -PassThru`;
    const launched = await execute(join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
      '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
    ], { env, windowsHide: true, timeout: 10000 });
    guiPid = Number(launched.stdout.trim());
    assert.ok(Number.isSafeInteger(guiPid) && guiPid > 0);
    const repaired = JSON.parse(await readFile(join(state, 'runtime.json'), 'utf8'));
    assert.ok(existsSync(repaired.node)); assert.ok(existsSync(repaired.git));
    let instance;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { instance = JSON.parse(await readFile(join(state, 'gui-instance.json'), 'utf8')); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; await delay(50); }
    }
    assert.ok(instance, 'The real GUI helper should start after rebuilding its setup');
    assert.equal(instance.pid, guiPid);
    const origin = `http://127.0.0.1:${instance.port}`;
    const headers = { Authorization: `Bearer ${instance.token}` };
    const statusResponse = await fetch(origin + '/api/status', { headers });
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.writable, true); assert.equal(status.pending, 0);
    const page = await (await fetch(origin + '/', { headers })).text();
    assert.match(page, /Save & publish quote/); assert.match(page, /Choose pictures/);
  });
}
