// Validates the committed .kiro configuration.
// 1. Runs `kiro-cli agent validate` on every agent (its exit code is 0 even
//    on errors, so the output is inspected).
// 2. Checks fields against the documented CLI V3 / IDE 1.0 schemas
//    (kiro.dev/docs/custom-agents/configuration-reference, kiro.dev/docs/hooks).
// 3. Enforces Haunted Ink invariants: the runtime reviser is tool-less.
// Usage: node scripts/validate-kiro-config.mjs [--quiet] [--no-cli]
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet');
const noCli = process.argv.includes('--no-cli');
const errors = [];
const notes = [];
const err = (f, m) => errors.push(`${path.relative(ROOT, f)}: ${m}`);

const AGENT_KEYS = new Set(['name', 'description', 'prompt', 'mcpServers', 'tools', 'excludedTools', 'permissions',
  'resources', 'hooks', 'includeMcpJson', 'includePowers', 'model', 'welcomeMessage']);
const CAPABILITIES = new Set(['fs_read', 'fs_write', 'shell', 'web_fetch', 'web_search', 'mcp', 'subagent', 'skill',
  'power', 'context', 'diagnostics', 'sandbox_network', 'all', 'builtin', 'filesystem']);
const EFFECTS = new Set(['allow', 'ask', 'deny']);
const TRIGGERS = new Set(['PreToolUse', 'PostToolUse', 'SessionStart', 'SessionEnd', 'Stop', 'UserPromptSubmit',
  'PreTaskExec', 'PostTaskExec', 'PostFileCreate', 'PostFileSave', 'PostFileDelete']);
const HOOK_KEYS = new Set(['name', 'description', 'trigger', 'matcher', 'action', 'timeout', 'enabled', 'confirm']);

function readJson(f) {
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { err(f, `invalid JSON: ${e.message}`); return null; }
}

function checkHook(f, h, i) {
  const at = `hooks[${i}]`;
  for (const k of Object.keys(h)) if (!HOOK_KEYS.has(k)) err(f, `${at}: unknown field "${k}"`);
  if (!h.name) err(f, `${at}: missing name`);
  if (!TRIGGERS.has(h.trigger)) err(f, `${at}: unsupported trigger "${h.trigger}"`);
  if (h.trigger === 'Stop' && h.matcher) err(f, `${at}: Stop hooks do not use matchers`);
  const a = h.action ?? {};
  if (a.type === 'command') {
    if (!a.command) err(f, `${at}: command action without command`);
    const m = /^node\s+(\S+\.m?js)\b/.exec(a.command ?? '');
    if (m && !existsSync(path.join(ROOT, m[1]))) err(f, `${at}: script not found: ${m[1]}`);
  } else if (a.type === 'agent') {
    if (!a.prompt) err(f, `${at}: agent action without prompt`);
  } else err(f, `${at}: action.type must be "command" or "agent"`);
  if (h.timeout !== undefined && !(Number.isInteger(h.timeout) && h.timeout >= 0)) err(f, `${at}: timeout must be a non-negative integer`);
}

// Agents
const agentDir = path.join(ROOT, '.kiro', 'agents');
const agents = existsSync(agentDir) ? readdirSync(agentDir).filter((n) => n.endsWith('.json')) : [];
if (!agents.length) errors.push('.kiro/agents: no agent configs found');
for (const n of agents) {
  const f = path.join(agentDir, n);
  const a = readJson(f);
  if (!a) continue;
  for (const k of Object.keys(a)) if (!AGENT_KEYS.has(k)) err(f, `unknown or legacy field "${k}"`);
  if (a.name && a.name !== n.replace(/\.json$/, '')) err(f, 'name should match the file name');
  if (!Array.isArray(a.tools)) err(f, 'tools must be an array');
  for (const [i, r] of (a.permissions?.rules ?? []).entries()) {
    if (!CAPABILITIES.has(r.capability)) err(f, `permissions.rules[${i}]: unknown capability "${r.capability}"`);
    if (!EFFECTS.has(r.effect)) err(f, `permissions.rules[${i}]: unknown effect "${r.effect}"`);
    if (r.match && !Array.isArray(r.match)) err(f, `permissions.rules[${i}]: match must be an array`);
  }
  (a.hooks ?? []).forEach((h, i) => checkHook(f, h, i));
  if (!noCli) {
    const r = spawnSync('kiro-cli', ['agent', 'validate', '--path', f], { encoding: 'utf8', timeout: 30_000, shell: false });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').filter((l) => !l.startsWith('[INFO')).join('\n');
    if (r.error) notes.push(`kiro-cli unavailable, skipped CLI validation (${r.error.code})`);
    else if (/error|invalid/i.test(out)) err(f, `kiro-cli agent validate: ${out.trim().slice(0, 400)}`);
  }
}

// Runtime agent invariants (Requirement 8): both runtime agents are tool-less.
for (const name of ['haunted-ink-reviser', 'haunted-ink-editor']) {
  const file = path.join(agentDir, `${name}.json`);
  const rev = existsSync(file) ? readJson(file) : null;
  if (!rev) { errors.push(`.kiro/agents/${name}.json is required`); continue; }
  if (rev.tools?.length !== 0) err(file, 'runtime agent must have tools: []');
  if (rev.includeMcpJson !== false || rev.includePowers !== false) err(file, 'includeMcpJson and includePowers must be false');
  if (Object.keys(rev.mcpServers ?? {}).length) err(file, 'mcpServers must be empty');
  if ((rev.resources ?? []).length) err(file, 'resources must be empty');
  if (rev.hooks?.length) err(file, 'runtime agent must not define hooks');
  const denyAll = (rev.permissions?.rules ?? []).some((r) => r.capability === 'all' && r.effect === 'deny');
  if (!denyAll) err(file, 'permissions must deny the "all" capability');
  if (!/untrusted/i.test(rev.prompt ?? '')) err(file, 'prompt must treat request content as untrusted data');
}

// Standalone hooks
const hookDir = path.join(ROOT, '.kiro', 'hooks');
for (const n of existsSync(hookDir) ? readdirSync(hookDir).filter((x) => x.endsWith('.json')) : []) {
  const f = path.join(hookDir, n);
  const h = readJson(f);
  if (!h) continue;
  if (h.version !== 'v1') err(f, 'version must be "v1"');
  if (!Array.isArray(h.hooks) || !h.hooks.length) err(f, 'hooks must be a non-empty array');
  else h.hooks.forEach((x, i) => checkHook(f, x, i));
}

// Steering front matter
const steerDir = path.join(ROOT, '.kiro', 'steering');
for (const n of existsSync(steerDir) ? readdirSync(steerDir).filter((x) => x.endsWith('.md')) : []) {
  const f = path.join(steerDir, n);
  const fm = /^---\n([\s\S]*?)\n---/.exec(readFileSync(f, 'utf8'));
  const inc = fm && /inclusion:\s*(\S+)/.exec(fm[1]);
  if (inc && !['always', 'fileMatch', 'manual', 'auto'].includes(inc[1])) err(f, `unknown inclusion "${inc[1]}"`);
}

// Spec files
for (const n of ['requirements.md', 'design.md', 'tasks.md']) {
  if (!existsSync(path.join(ROOT, '.kiro', 'specs', 'haunted-ink', n))) errors.push(`.kiro/specs/haunted-ink/${n} missing`);
}

if (errors.length) {
  console.error(`Kiro config: ${errors.length} problem(s)\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
if (!quiet) console.log(`Kiro config OK: ${agents.length} agents, hooks, steering and spec checked.${notes.length ? ' ' + notes.join('; ') : ''}`);
