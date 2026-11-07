// Shared helpers for Haunted Ink Kiro CLI hooks. No dependencies.
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function workDir() {
  if (process.env.HAUNTED_INK_WORK_DIR) return path.resolve(process.env.HAUNTED_INK_WORK_DIR);
  const local = path.resolve(ROOT, '..', '..', 'work');
  return existsSync(local) ? local : null;
}

export async function readEvent() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { _unparsed: raw.slice(0, 200) }; }
}

// Append one compact line per hook decision. Never logs file contents or prompts.
export function logEvidence(hook, event, decision, detail = '') {
  const file = process.env.HAUNTED_INK_HOOK_LOG
    ? path.resolve(process.env.HAUNTED_INK_HOOK_LOG)
    : path.join(ROOT, '.kiro', 'evidence', 'hook-events.jsonl');
  mkdirSync(path.dirname(file), { recursive: true });
  const line = {
    ts: new Date().toISOString(),
    hook,
    trigger: event.hook_event_name ?? null,
    session: event.session_id ? String(event.session_id).slice(0, 48) : null,
    tool: event.tool_name ?? null,
    decision,
    detail: String(detail).slice(0, 300),
  };
  appendFileSync(file, JSON.stringify(line) + '\n');
}

// Collect string values that look like paths from an arbitrary tool_input shape.
export function collectPaths(input, out = []) {
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' && /(^|_)(path|file|target|targetfile|filepath|destination)s?$/i.test(k)) out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => (typeof x === 'object' ? collectPaths(x, out) : null));
    else if (typeof v === 'object') collectPaths(v, out);
  }
  return out;
}

export function commandOf(input) {
  if (!input || typeof input !== 'object') return '';
  return String(input.command ?? input.cmd ?? input.script ?? '');
}
