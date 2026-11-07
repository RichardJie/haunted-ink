import { randomUUID } from 'node:crypto';
import type { JobKind, JobState, JobView } from '../../shared/types.ts';
import { KiroError } from './runner.ts';
import * as tasks from './tasks.ts';
import type { JobRequest, JobResult, RunFn } from './tasks.ts';

export type { JobRequest, RunFn, RevisionRequest } from './tasks.ts';

interface Job {
  id: string;
  kind: JobKind;
  req: JobRequest;
  state: JobState;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  result?: JobResult;
  error?: JobView['error'];
  controller: AbortController;
  timer?: NodeJS.Timeout;
  done?: Promise<void>;
}

/** The paragraph reviser and the editorial agent are separate tool-less agents; tests may pass one function for both. */
export type Runners = RunFn | { reviser: RunFn; editor: RunFn };

export interface QueueOptions { timeoutMs?: number; maxQueued?: number; keepMs?: number }

const WHAT: Record<JobKind, string> = { revision: 'revision', structure: 'outline request', draft: 'draft', review: 'review' };

/** One shared queue for every Kiro job: one process at a time, a few waiting. */
export function createJobQueue(runners: Runners, opts: QueueOptions = {}) {
  const reviser = typeof runners === 'function' ? runners : runners.reviser;
  const editor = typeof runners === 'function' ? runners : runners.editor;
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const maxQueued = opts.maxQueued ?? 3;
  const keepMs = opts.keepMs ?? 600_000;
  const jobs = new Map<string, Job>();
  const waiting: Job[] = [];
  let running: Job | undefined;
  let closed = false;

  const finish = (job: Job, state: JobState, extra: Partial<Job> = {}) => {
    clearTimeout(job.timer);
    job.state = state;
    job.endedAt = Date.now();
    Object.assign(job, extra);
    setTimeout(() => jobs.delete(job.id), keepMs).unref();
  };

  async function execute(job: Job) {
    running = job;
    job.state = 'running';
    job.startedAt = Date.now();
    job.timer = setTimeout(() => job.controller.abort('timed_out'), timeoutMs);
    try {
      const signal = job.controller.signal;
      const req = job.req;
      let result: JobResult;
      switch (job.kind) {
        case 'revision': result = await tasks.revision(req as tasks.RevisionRequest, reviser, signal); break;
        case 'structure': result = await tasks.structure(req as tasks.StructureRequest, editor, signal); break;
        case 'draft': result = await tasks.draft(req as tasks.DraftRequest, editor, signal); break;
        case 'review': result = await tasks.review(req as tasks.ReviewRequest, editor, signal); break;
      }
      tasks.throwIfAborted(signal);
      finish(job, 'succeeded', { result });
    } catch (e) {
      const err = e instanceof KiroError ? e : new KiroError('cli_error', e instanceof Error ? e.message : String(e));
      if (err.code === 'cancelled') finish(job, 'cancelled', { error: { code: err.code, message: `The ${WHAT[job.kind]} was cancelled.` } });
      else if (err.code === 'timed_out') finish(job, 'timed_out', { error: { code: err.code, message: 'Kiro did not answer within 90 seconds.', fix: 'Run it again, or give Kiro less text.' } });
      else finish(job, 'failed', { error: { code: err.code, message: err.message, fix: err.fix } });
    } finally {
      running = undefined;
      next();
    }
  }

  function next() {
    if (closed || running) return;
    const job = waiting.shift();
    if (job) job.done = execute(job);
  }

  function submit(req: JobRequest): { id: string; position: number } | null {
    if (closed) return null;
    if (running && waiting.length >= maxQueued) return null;
    const job: Job = { id: randomUUID(), kind: req.kind ?? 'revision', req, state: 'queued', createdAt: Date.now(), controller: new AbortController() };
    jobs.set(job.id, job);
    waiting.push(job);
    const position = running ? waiting.length : 0;
    next();
    return { id: job.id, position };
  }

  /** A job is only visible through the route of its own kind. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the result shape depends on the job's kind; routes and tests know which
  function view(id: string, kind?: JobKind): JobView<any> | undefined {
    const j = jobs.get(id);
    if (!j || (kind && j.kind !== kind)) return undefined;
    const position = j.state === 'queued' ? waiting.indexOf(j) + 1 : undefined;
    const end = j.endedAt ?? Date.now();
    return { id, state: j.state, position, elapsedMs: end - (j.startedAt ?? j.createdAt), result: j.result, error: j.error };
  }

  function cancel(id: string, kind?: JobKind): boolean {
    const j = jobs.get(id);
    if (!j || (kind && j.kind !== kind)) return false;
    if (j.state === 'queued') {
      waiting.splice(waiting.indexOf(j), 1);
      finish(j, 'cancelled', { error: { code: 'cancelled', message: `The ${WHAT[j.kind]} was cancelled.` } });
    } else if (j.state === 'running') j.controller.abort('cancelled');
    return true;
  }

  async function shutdown() {
    closed = true;
    for (const j of [...waiting]) cancel(j.id);
    const r = running;
    if (r) { r.controller.abort('cancelled'); await r.done; }
  }

  return { submit, view, cancel, shutdown };
}

/** Kept for the original single-agent tests and callers. */
export const createRevisionQueue = createJobQueue;
