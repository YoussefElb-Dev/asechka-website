import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DATA_ONLY_PATTERNS = [
  /^dist\/(?:together|memories|journal|keepsakes|music)\.json$/,
  /^dist\/assets\/(?:photos|bucket)\//,
  /^dist\/updates\//,
  /^private\//,
];

export function shouldIgnoreFiles(files) {
  const cleaned = (files || []).map(f => String(f || '').trim()).filter(Boolean);
  if (cleaned.length === 0) return false;
  return cleaned.every(file => DATA_ONLY_PATTERNS.some(pattern => pattern.test(file)));
}

function run() {
  const prev = process.env.VERCEL_GIT_PREVIOUS_SHA || '';
  const curr = process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD';
  if (!prev || /^0+$/.test(prev)) {
    console.log('Vercel ignore check: initial or unknown previous SHA — proceeding with build.');
    process.exit(1);
  }
  try {
    const output = execFileSync('git', ['diff', '--name-only', prev, curr], { encoding: 'utf8' });
    const files = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (shouldIgnoreFiles(files)) {
      console.log(`Vercel ignore check: ${files.length} data-only file(s) changed — skipping deploy.`);
      process.exit(0);
    }
    console.log(`Vercel ignore check: app/code changes detected (${files.length} file(s)) — proceeding with build.`);
    process.exit(1);
  } catch {
    console.log('Vercel ignore check: git diff unavailable — proceeding with build.');
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run();
}
