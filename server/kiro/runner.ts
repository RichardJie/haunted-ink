import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type KiroErrorCode = 'missing' | 'logged_out' | 'cli_error' | 'cancelled' | 'timed_out' | 'bad_output';

export class KiroError extends Error {
  code: KiroErrorCode;
  fix?: string;
  constructor(code: KiroErrorCode, message: string, fix?: string) {
    super(message);
    this.code = code;
    this.fix = fix;
  }
}

export type AgentName = 'haunted-ink-reviser' | 'haunted-ink-editor';

export const kiroArgs = (agent: string): string[] => [
  'chat', '--v3', '--no-interactive', '--agent', agent,
  '--trust-tools=', '--output-format', 'stream-json',
];
export const KIRO_ARGS = kiroArgs('haunted-ink-reviser');

export interface RunnerOptions {
  command?: string;
  args?: string[];
  /** Which tool-less runtime agent this runner starts (default: the paragraph reviser). */
  agentName?: AgentName;
  agentJson: string;
  killGraceMs?: number;
  /** Called once when the run's session id first appears in the stream (before any abort handling). */
  onSessionId?: (id: string) => void;
  /** Called after every run with the session cleanup outcome. Defaults to a one-line warning on failure. */
  onCleanup?: (report: CleanupReport) => void;
}

/**
 * `deleted`: true = deletion ran and the id is absent from this run's own directory listing;
 * false = still listed or the CLI failed; 'skipped' = no session id or not the real kiro-cli.
 */
export interface CleanupReport { sessionId?: string; deleted: boolean | 'skipped'; warning?: string }

const warnCleanup = (r: CleanupReport) => {
  if (r.warning) console.warn(`[haunted-ink] Kiro session cleanup warning: ${r.warning}`);
};

export function minimalEnv(): NodeJS.ProcessEnv {
  const e = process.env;
  const env: NodeJS.ProcessEnv = { HAUNTED_INK_RUN: '1' };
  for (const k of ['PATH', 'HOME', 'USER', 'LANG', 'TMPDIR']) if (e[k]) env[k] = e[k];
  return env;
}

export const LOGIN_FIX = 'Run `kiro-cli login` in a terminal, then try again.';
export const INSTALL_FIX = 'Install the Kiro CLI (https://kiro.dev/cli), then run `kiro-cli login`.';

export function classify(text: string): KiroError | undefined {
  if (/not logged in|please log ?in|kiro-cli login|unauthori[sz]ed|authentication/i.test(text)) {
    return new KiroError('logged_out', 'Kiro CLI is not logged in.', LOGIN_FIX);
  }
  return undefined;
}

/** Runs one request (revision, outline, draft or review) in a fresh temporary directory. Resolves with the run's final text. */
export function createKiroRunner(opts: RunnerOptions) {
  const command = opts.command ?? 'kiro-cli';
  const agentName = opts.agentName ?? 'haunted-ink-reviser';
  const args = opts.args ?? kiroArgs(agentName);
  const grace = opts.killGraceMs ?? 3000;

  return async function run(prompt: string, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw abortError(signal);
    const dir = await mkdtemp(join(tmpdir(), 'haunted-ink-run-'));
    let sessionId: string | undefined;
    try {
      await mkdir(join(dir, '.kiro', 'agents'), { recursive: true });
      await mkdir(join(dir, '.kiro', 'settings'), { recursive: true });
      await writeFile(join(dir, '.kiro', 'agents', `${agentName}.json`), opts.agentJson);
      // Workspace-scoped (this temporary directory only): ask Kiro not to inherit default skills/steering.
      await writeFile(join(dir, '.kiro', 'settings', 'cli.json'), JSON.stringify({ 'chat.disableInheritingDefaultResources': true }));
      const result = await spawnAndCollect(command, args, prompt, dir, signal, grace, (id) => {
        sessionId = id;
        opts.onSessionId?.(id);
      });
      sessionId = result.sessionId ?? sessionId;
      if (result.error) throw result.error;
      return result.finalText ?? '';
    } finally {
      const report = await deleteSession(command, dir, sessionId);
      (opts.onCleanup ?? warnCleanup)(report);
      await rm(dir, { recursive: true, force: true });
    }
  };
}

function abortError(signal: AbortSignal): KiroError {
  return signal.reason === 'timed_out'
    ? new KiroError('timed_out', 'Kiro did not answer within 90 seconds.')
    : new KiroError('cancelled', 'The request was cancelled.');
}

interface Collected { finalText?: string; sessionId?: string; error?: KiroError }

function sessionIdOf(line: string): string | undefined {
  if (!line.startsWith('{')) return undefined;
  try {
    const id = (JSON.parse(line) as { data?: { sessionId?: unknown } }).data?.sessionId;
    return typeof id === 'string' && /^[\w.-]{1,200}$/.test(id) ? id : undefined;
  } catch { return undefined; }
}

function spawnAndCollect(command: string, args: string[], prompt: string, cwd: string, signal: AbortSignal, grace: number, onSession: (id: string) => void): Promise<Collected> {
  return new Promise((resolve) => {
    // The signal may have fired while the temporary directory was being prepared.
    if (signal.aborted) return resolve({ error: abortError(signal) });
    const child = spawn(command, args, { cwd, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'], env: minimalEnv() });
    let out = '';
    let outBytes = 0;
    let errTail = '';
    let spawnError: NodeJS.ErrnoException | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const killGroup = () => {
      if (child.pid === undefined || child.exitCode !== null) return;
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
      killTimer = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* gone */ } }, grace);
    };
    const onAbort = () => killGroup();
    signal.addEventListener('abort', onAbort, { once: true });

    child.on('error', (e) => { spawnError = e; });
    // The session id is captured while streaming, so a cancelled run still knows which session to delete.
    let sessionId: string | undefined;
    let scanned = 0;
    child.stdout.on('data', (d: Buffer) => {
      outBytes += d.length;
      if (outBytes <= 2_000_000) out += d.toString('utf8');
      if (sessionId) return;
      for (let nl = out.indexOf('\n', scanned); nl >= 0 && !sessionId; nl = out.indexOf('\n', scanned)) {
        const id = sessionIdOf(out.slice(scanned, nl));
        scanned = nl + 1;
        if (id) { sessionId = id; onSession(id); }
      }
    });
    child.stderr.on('data', (d: Buffer) => { errTail = (errTail + d.toString('utf8')).slice(-65536); });
    child.stdin.on('error', () => { /* child exited early */ });
    child.stdin.end(prompt);

    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort);
      clearTimeout(killTimer);
      // Stragglers in the process group are removed as well.
      if (child.pid !== undefined) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* none left */ } }
      if (!sessionId) sessionId = sessionIdOf(out.slice(scanned).trim());
      if (signal.aborted) return resolve({ sessionId, error: abortError(signal) });
      if (spawnError) {
        return resolve({ sessionId, error: spawnError.code === 'ENOENT'
          ? new KiroError('missing', 'The kiro-cli command was not found.', INSTALL_FIX)
          : new KiroError('cli_error', `Could not start kiro-cli: ${spawnError.message}`) });
      }
      let finalText: string | undefined;
      let status: string | undefined;
      for (const line of out.split('\n')) {
        if (!line.startsWith('{')) continue;
        try {
          const ev = JSON.parse(line) as { type?: string; data?: { status?: string; finalText?: string } };
          if (ev.type === 'runFinished') { finalText = ev.data?.finalText; status = ev.data?.status; }
        } catch { /* not an event */ }
      }
      if (status === 'success' && finalText !== undefined) return resolve({ finalText, sessionId });
      const detail = (errTail + '\n' + (finalText ?? '')).trim();
      const classified = classify(detail);
      if (classified) return resolve({ sessionId, error: classified });
      const msg = detail.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 300);
      resolve({ sessionId, error: new KiroError('cli_error', `kiro-cli ended with ${status ?? `exit code ${code}`}${msg ? `: ${msg}` : ''}`, 'Run `kiro-cli whoami` to check your login, then try again.') });
    });
  });
}

function runIn(command: string, args: string[], cwd: string, ms: number): Promise<{ code: number | null; out: string; failed?: string }> {
  return new Promise((resolve) => {
    const c = spawn(command, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'ignore'], env: minimalEnv() });
    let out = '';
    const t = setTimeout(() => { c.kill('SIGKILL'); resolve({ code: null, out, failed: 'timed out' }); }, ms);
    c.stdout.on('data', (d: Buffer) => { if (out.length < 1_000_000) out += d; });
    c.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
    c.on('error', (e) => { clearTimeout(t); resolve({ code: null, out, failed: e.message }); });
  });
}

/** Ids of the sessions saved for this run's own temporary directory (only ids are read). */
function listedIds(out: string): string[] | undefined {
  try {
    const envelopes = JSON.parse(out) as { sessions?: unknown[] }[];
    if (!Array.isArray(envelopes)) return undefined;
    return envelopes.flatMap((e) => (Array.isArray(e?.sessions) ? e.sessions : []))
      .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>).id ?? (s as Record<string, unknown>).sessionId : s))
      .filter((x): x is string => typeof x === 'string');
  } catch { return undefined; }
}

/** Deletes only this run's session, from inside this run's directory, then confirms it is no longer listed there. */
async function deleteSession(command: string, cwd: string, sessionId?: string): Promise<CleanupReport> {
  if (!sessionId || command !== 'kiro-cli') return { sessionId, deleted: 'skipped' };
  const del = await runIn(command, ['chat', '--delete-session', sessionId], cwd, 10_000);
  const list = await runIn(command, ['chat', '--v3', '--list-sessions', '--format', 'json'], cwd, 10_000);
  const ids = list.code === 0 ? listedIds(list.out) : undefined;
  if (ids === undefined) {
    return { sessionId, deleted: false, warning: `could not confirm deletion of ${sessionId} (delete ${del.failed ?? `exit ${del.code}`}, list ${list.failed ?? `exit ${list.code}`})` };
  }
  if (ids.includes(sessionId)) return { sessionId, deleted: false, warning: `session ${sessionId} is still listed after delete (exit ${del.code})` };
  return { sessionId, deleted: true };
}

export interface Health { kiro: 'ready' | 'missing' | 'logged_out' | 'unknown'; version?: string; detail?: string }

function runShort(command: string, args: string[]): Promise<{ code: number | null; out: string; error?: NodeJS.ErrnoException }> {
  return new Promise((resolve) => {
    const c = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: minimalEnv() });
    let out = '';
    const t = setTimeout(() => c.kill('SIGKILL'), 15_000);
    c.stdout.on('data', (d: Buffer) => { out += d; });
    c.stderr.on('data', (d: Buffer) => { out += d; });
    c.on('error', (error) => { clearTimeout(t); resolve({ code: null, out, error }); });
    c.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}

export function createHealthProbe(command = 'kiro-cli') {
  let cached: { at: number; h: Health } | undefined;
  return async function health(): Promise<Health> {
    if (cached && Date.now() - cached.at < 60_000) return cached.h;
    let h: Health;
    const v = await runShort(command, ['--version']);
    if (v.error?.code === 'ENOENT') h = { kiro: 'missing', detail: INSTALL_FIX };
    else if (v.error) h = { kiro: 'unknown', detail: v.error.message };
    else {
      const version = /(\d+\.\d+\.\d+)/.exec(v.out)?.[1];
      const w = await runShort(command, ['whoami']);
      if (w.code === 0 && !/not logged in/i.test(w.out)) h = { kiro: 'ready', version };
      else if (/not logged in|login/i.test(w.out)) h = { kiro: 'logged_out', version, detail: LOGIN_FIX };
      else h = { kiro: 'unknown', version, detail: 'Could not confirm the Kiro login with `kiro-cli whoami`.' };
    }
    cached = { at: Date.now(), h };
    return h;
  };
}
