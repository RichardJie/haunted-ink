// SessionStart: stdout is added to the agent's context. Print the next
// unchecked tasks and the latest devlog heading so each session resumes
// from the plan instead of from memory.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readEvent, logEvidence, ROOT } from './lib.mjs';

const event = await readEvent();
const tasksFile = path.join(ROOT, '.kiro', 'specs', 'haunted-ink', 'tasks.md');
const devlog = path.join(ROOT, '.kiro', 'devlog.md');

const lines = existsSync(tasksFile) ? readFileSync(tasksFile, 'utf8').split('\n') : [];
const open = lines.filter((l) => /^\s*- \[ \]/.test(l));
const done = lines.filter((l) => /^\s*- \[x\]/i.test(l)).length;
const lastLog = existsSync(devlog)
  ? readFileSync(devlog, 'utf8').split('\n').filter((l) => l.startsWith('## ')).pop()
  : null;

console.log('Haunted Ink session brief (from SessionStart hook)');
console.log(`Tasks: ${done} done, ${open.length} open.`);
if (open.length) console.log('Next open tasks:\n' + open.slice(0, 3).map((l) => l.trim()).join('\n'));
if (lastLog) console.log(`Latest devlog entry: ${lastLog.replace(/^## /, '')}`);
console.log('Rules: kiro-cli is the only model runtime; no API keys; no publish/deploy; log the session in .kiro/devlog.md.');
logEvidence('session-brief', event, 'briefed', `${done} done / ${open.length} open`);
process.exit(0);
