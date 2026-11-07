// PostToolUse (write): record which files changed and re-validate Kiro
// configuration whenever an agent, hook, steering or spec file is edited.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readEvent, logEvidence, collectPaths, ROOT } from './lib.mjs';

const event = await readEvent();
const base = event.cwd ? path.resolve(event.cwd) : ROOT;
const rels = collectPaths(event.tool_input).map((p) => path.relative(ROOT, path.resolve(base, p)));

if (rels.some((r) => /^\.kiro\/(agents|hooks|steering|specs)\//.test(r))) {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'validate-kiro-config.mjs'), '--quiet'], {
    cwd: ROOT, encoding: 'utf8', timeout: 60_000, shell: false,
  });
  const ok = res.status === 0;
  logEvidence('after-write', event, ok ? 'kiro-config-valid' : 'kiro-config-invalid', rels.join(', '));
  if (!ok) {
    console.error(`Kiro config validation failed after editing ${rels.join(', ')}:\n${(res.stdout + res.stderr).slice(-1500)}`);
    process.exit(1); // warning shown; the tool already ran
  }
} else {
  logEvidence('after-write', event, 'recorded', rels.join(', '));
}
process.exit(0);
