// Stop: when the agent finishes a turn, run the fast project check
// (`npm run check`: typecheck + unit tests + Kiro config validation).
// On failure, ask the agent to keep working, at most twice in a row,
// so a broken build cannot be reported as finished.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readEvent, logEvidence, ROOT } from './lib.mjs';

const MAX_CONSECUTIVE_BLOCKS = 2;
const event = await readEvent();
const counterFile = path.join(ROOT, '.kiro', 'evidence', '.stop-blocks');
const pkgFile = path.join(ROOT, 'package.json');

function skip(reason) { logEvidence('stop-verify', event, 'skipped', reason); process.exit(0); }

if (!existsSync(pkgFile)) skip('no package.json yet');
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
if (!pkg.scripts?.check) skip('no "check" script yet');
if (!existsSync(path.join(ROOT, 'node_modules'))) skip('dependencies not installed');

const res = spawnSync('npm', ['run', '-s', 'check'], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, shell: false });
mkdirSync(path.dirname(counterFile), { recursive: true });
const blocks = existsSync(counterFile) ? Number(readFileSync(counterFile, 'utf8')) || 0 : 0;

if (res.status === 0) {
  writeFileSync(counterFile, '0');
  logEvidence('stop-verify', event, 'pass', 'npm run check');
  process.exit(0);
}
const tail = `${res.stdout ?? ''}\n${res.stderr ?? ''}`.trim().slice(-1500);
if (blocks >= MAX_CONSECUTIVE_BLOCKS) {
  writeFileSync(counterFile, '0');
  logEvidence('stop-verify', event, 'fail-released', `still failing after ${blocks} retries`);
  console.error('npm run check is still failing; reporting to the user instead of retrying.');
  process.exit(3);
}
writeFileSync(counterFile, String(blocks + 1));
logEvidence('stop-verify', event, 'fail-continue', `attempt ${blocks + 1}`);
console.log(JSON.stringify({
  decision: 'block',
  reason: `npm run check failed. Fix it before finishing, or explain why it cannot pass.\n${tail}`,
}));
process.exit(0);
