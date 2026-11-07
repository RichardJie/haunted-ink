import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.ts';
import { createRevisionQueue } from '../../server/kiro/queue.ts';
import { createKiroRunner, type CleanupReport } from '../../server/kiro/runner.ts';
import { freePort, jsonHeaders, pgrep, raw, sleep } from './helpers.ts';

// The fixture child never answers. It exists only to test process control, not model output.
const fixture = fileURLToPath(new URL('../fixtures/slow-child.mjs', import.meta.url));
const runnerFor = (marker: string, mode = '') =>
  createKiroRunner({ command: process.execPath, args: [fixture, marker, mode], agentJson: '{}', killGraceMs: 300 });
const req = { paragraph: 'A paragraph [@a] from 2020.', intent: 'tighten' };

async function until(fn: () => boolean | Promise<boolean>, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(50); }
  throw new Error('condition not reached');
}

describe('revision queue with a non-answering child process', () => {
  it('cancels a running job and leaves no child or grandchild', async () => {
    const marker = `cancel-${process.pid}-${Date.now()}`;
    const q = createRevisionQueue(runnerFor(marker));
    const job = q.submit(req)!;
    await until(async () => (await pgrep(marker)) >= 2);
    expect(q.view(job.id)?.state).toBe('running');
    q.cancel(job.id);
    await until(() => q.view(job.id)?.state === 'cancelled');
    await until(async () => (await pgrep(marker)) === 0);
  });

  it('REGRESSION: a run cancelled after a sessionUpdate still reports its session for cleanup', async () => {
    const marker = `session-${process.pid}-${Date.now()}`;
    const reports: CleanupReport[] = [];
    const ac = new AbortController();
    const run = createKiroRunner({
      command: process.execPath, args: [fixture, marker, 'session'], agentJson: '{}', killGraceMs: 300,
      onSessionId: () => ac.abort('cancelled'),
      onCleanup: (r) => reports.push(r),
    });
    await expect(run('prompt', ac.signal)).rejects.toMatchObject({ code: 'cancelled' });
    // The fixture is not kiro-cli, so deletion itself is skipped, but the captured id survives the abort.
    expect(reports).toEqual([{ sessionId: 'sess_fixture-0001', deleted: 'skipped' }]);
    await until(async () => (await pgrep(marker)) === 0);
  });

  it('escalates to SIGKILL when the child ignores SIGTERM', async () => {
    const marker = `stubborn-${process.pid}-${Date.now()}`;
    const q = createRevisionQueue(runnerFor(marker, 'stubborn'));
    const job = q.submit(req)!;
    await until(async () => (await pgrep(marker)) >= 1);
    q.cancel(job.id);
    await until(() => q.view(job.id)?.state === 'cancelled');
    await until(async () => (await pgrep(marker)) === 0);
  });

  it('times out', async () => {
    const marker = `timeout-${process.pid}-${Date.now()}`;
    const q = createRevisionQueue(runnerFor(marker), { timeoutMs: 600 });
    const job = q.submit(req)!;
    await until(() => q.view(job.id)?.state === 'timed_out');
    await until(async () => (await pgrep(marker)) === 0);
  });

  it('runs one at a time, queues three, refuses the fifth, and a queued job cancelled before start never spawns', async () => {
    const marker = `queue-${process.pid}-${Date.now()}`;
    const q = createRevisionQueue(runnerFor(marker));
    const jobs = [1, 2, 3, 4].map(() => q.submit(req)!);
    expect(jobs.every(Boolean)).toBe(true);
    expect(q.submit(req)).toBeNull();
    expect(q.view(jobs[0].id)?.state).toBe('running');
    expect(q.view(jobs[3].id)).toMatchObject({ state: 'queued', position: 3 });
    q.cancel(jobs[1].id);
    expect(q.view(jobs[1].id)?.state).toBe('cancelled');
    expect(q.view(jobs[3].id)?.position).toBe(2);
    await until(async () => (await pgrep(marker)) === 2);
    await sleep(300);
    expect(await pgrep(marker)).toBe(2); // one child and its grandchild only
    await q.shutdown();
    await until(async () => (await pgrep(marker)) === 0);
    expect(q.view(jobs[2].id)?.state).toBe('cancelled');
  });

  it('answers HTTP 429 beyond the queue limit', async () => {
    const marker = `http-${process.pid}-${Date.now()}`;
    const port = await freePort();
    const app = createApp({ port, run: runnerFor(marker), health: async () => ({ kiro: 'ready' }) });
    await new Promise<void>((r) => app.server.listen(port, '127.0.0.1', r));
    const post = () => raw(port, { method: 'POST', path: '/api/revisions', headers: jsonHeaders(port), body: JSON.stringify(req) });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await post()).status);
    expect(statuses).toEqual([202, 202, 202, 202, 429]);
    app.server.close();
    await app.shutdown();
    await until(async () => (await pgrep(marker)) === 0);
  });

  it('reports a missing CLI with the install and login commands', async () => {
    const q = createRevisionQueue(createKiroRunner({ command: 'definitely-not-kiro-cli-xyz', args: [], agentJson: '{}' }));
    const job = q.submit(req)!;
    await until(() => q.view(job.id)?.state === 'failed');
    expect(q.view(job.id)?.error).toMatchObject({ code: 'missing' });
    expect(q.view(job.id)?.error?.fix).toContain('kiro-cli login');
  });
});
