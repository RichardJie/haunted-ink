// PreToolUse (write): keep agent file writes inside the project or the
// parent work directory, and away from secrets and dependency folders.
import path from 'node:path';
import { readEvent, logEvidence, collectPaths, ROOT, workDir } from './lib.mjs';

const event = await readEvent();
const base = event.cwd ? path.resolve(event.cwd) : ROOT;
const targets = collectPaths(event.tool_input).map((p) => path.resolve(base, p.replace(/^~(?=\/)/, process.env.HOME ?? '~')));
const allowedRoots = [ROOT, workDir()].filter(Boolean);

function inside(p, root) {
  const rel = path.relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

for (const t of targets) {
  const rel = path.relative(ROOT, t);
  let why = null;
  if (!allowedRoots.some((r) => inside(t, r))) why = `outside the project and work directory: ${t}`;
  else if (/(^|\/)\.env(\.|$)/.test(rel)) why = 'environment/secret files are not written by agents';
  else if (/(^|\/)node_modules\//.test(rel) || rel.startsWith('.git/') || rel === '.git') why = 'node_modules and .git are not edited directly';
  else if (rel.startsWith('.kiro/evidence/')) why = 'hook evidence is written only by hook scripts';
  if (why) {
    logEvidence('guard-writes', event, 'block', why);
    console.error(`Blocked by Haunted Ink hook: ${why}`);
    process.exit(2);
  }
}
logEvidence('guard-writes', event, 'allow', targets.map((t) => path.relative(ROOT, t)).join(', '));
process.exit(0);
