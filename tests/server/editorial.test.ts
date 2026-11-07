import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.ts';
import { createJobQueue } from '../../server/kiro/queue.ts';
import { createKiroRunner } from '../../server/kiro/runner.ts';
import { freePort, jsonHeaders, pgrep, raw, sleep } from './helpers.ts';

// The fixture child never answers. It exists only to test process control and routing, not model output.
const fixture = fileURLToPath(new URL('../fixtures/slow-child.mjs', import.meta.url));
const runnerFor = (marker: string) => createKiroRunner({ command: process.execPath, args: [fixture, marker, ''], agentJson: '{}', killGraceMs: 300 });

const bodies = {
  revisions: { paragraph: 'A paragraph.', intent: 'tighten' },
  outline: { notes: 'Some notes [@a].', knownKeys: ['a'] },
  drafts: { item: { heading: 'H', brief: 'Brief', evidence: [{ claim: 'c', status: 'needed' }] }, notes: 'n', knownKeys: [], before: '', after: '' },
  reviews: { blockId: 'b-1', paragraph: 'A paragraph to review.' },
};

async function until(fn: () => boolean | Promise<boolean>, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(50); }
  throw new Error('condition not reached');
}

type Ready = { kiro: 'ready' | 'missing' | 'logged_out'; detail?: string };

async function serve(run: ReturnType<typeof runnerFor>, health: () => Promise<Ready> = async () => ({ kiro: 'ready' })) {
  const port = await freePort();
  const app = createApp({ port, run, health });
  await new Promise<void>((r) => app.server.listen(port, '127.0.0.1', r));
  const post = (path: string, body: unknown) => raw(port, { method: 'POST', path, headers: jsonHeaders(port), body: JSON.stringify(body) });
  const get = (path: string) => raw(port, { path, headers: { Host: `127.0.0.1:${port}` } });
  const del = (path: string) => raw(port, { method: 'DELETE', path, headers: { ...jsonHeaders(port), 'Content-Length': '2' }, body: '{}' });
  return { port, app, post, get, del, close: async () => { app.server.close(); await app.shutdown(); } };
}

describe('editorial routes', () => {
  it('validate bodies: size, required text, limits', async () => {
    const marker = `val-${process.pid}-${Date.now()}`;
    const s = await serve(runnerFor(marker));
    expect((await s.post('/api/outline', { notes: '   ', knownKeys: [] })).status).toBe(400);
    expect((await s.post('/api/outline', { notes: 'x'.repeat(20_001), knownKeys: [] })).status).toBe(400);
    expect((await s.post('/api/outline', { notes: 'x', knownKeys: Array(101).fill('k') })).status).toBe(400);
    expect((await s.post('/api/drafts', { ...bodies.drafts, item: { ...bodies.drafts.item, brief: '' } })).status).toBe(400);
    expect((await s.post('/api/drafts', { ...bodies.drafts, before: 'x'.repeat(4001) })).status).toBe(400);
    expect((await s.post('/api/reviews', { blockId: 'b', paragraph: '' })).status).toBe(400);
    expect((await s.post('/api/reviews', { blockId: 'b', paragraph: 'x'.repeat(4001) })).status).toBe(400);
    expect((await s.post('/api/reviews', { paragraph: 'x' })).status).toBe(400);
    const big = await raw(s.port, { method: 'POST', path: '/api/outline', headers: jsonHeaders(s.port), body: JSON.stringify({ notes: 'x'.repeat(66_000) }) });
    expect(big.status).toBe(413);
    // Same guards as every other route: foreign origin is refused.
    const foreign = await raw(s.port, { method: 'POST', path: '/api/reviews', headers: { ...jsonHeaders(s.port), Origin: 'http://evil.example' }, body: JSON.stringify(bodies.reviews) });
    expect(foreign.status).toBe(403);
    await s.close();
    expect(await pgrep(marker)).toBe(0);
  });

  it('reports a missing or logged-out Kiro CLI with the fix, on every editorial route', async () => {
    const detail = 'Run the login command in a terminal, then try again.';
    const s = await serve(runnerFor('unused'), async () => ({ kiro: 'logged_out', detail }));
    for (const [path, body] of [['/api/outline', bodies.outline], ['/api/drafts', bodies.drafts], ['/api/reviews', bodies.reviews]] as const) {
      const r = await s.post(path, body);
      expect(r.status).toBe(503);
      expect(r.json()).toMatchObject({ error: 'logged_out', fix: detail });
    }
    await s.close();
  });

  it('shares ONE queue across all four kinds: 1 running + 3 waiting, the fifth is refused', async () => {
    const marker = `mixed-${process.pid}-${Date.now()}`;
    const s = await serve(runnerFor(marker));
    const order = ['revisions', 'outline', 'drafts', 'reviews', 'outline'] as const;
    const replies = [];
    for (const k of order) replies.push(await s.post(`/api/${k}`, bodies[k]));
    expect(replies.map((r) => r.status)).toEqual([202, 202, 202, 202, 429]);
    await until(async () => (await pgrep(marker)) >= 2);
    await sleep(300);
    expect(await pgrep(marker)).toBe(2); // one child and its grandchild: never two Kiro processes
    // A job is visible only through its own route.
    const id = replies[1].json().id;
    expect((await s.get(`/api/outline/${id}`)).json()).toMatchObject({ state: 'queued', position: 1 });
    expect((await s.get(`/api/reviews/${id}`)).status).toBe(404);
    expect((await s.del(`/api/drafts/${id}`)).status).toBe(404);
    await s.close();
    await until(async () => (await pgrep(marker)) === 0);
  });

  it('cancelling a queued editorial job removes it without ever spawning, and frees a slot', async () => {
    const marker = `cq-${process.pid}-${Date.now()}`;
    const s = await serve(runnerFor(marker));
    const first = await s.post('/api/reviews', bodies.reviews);
    const queued = await s.post('/api/drafts', bodies.drafts);
    await until(async () => (await pgrep(marker)) >= 2);
    expect((await s.del(`/api/drafts/${queued.json().id}`)).status).toBe(200);
    const v = (await s.get(`/api/drafts/${queued.json().id}`)).json();
    expect(v.state).toBe('cancelled');
    expect(v.error.message).toMatch(/draft was cancelled/);
    // Cancel the running one: its process group goes away and the (cancelled) queued job never started.
    expect((await s.del(`/api/reviews/${first.json().id}`)).status).toBe(200);
    await until(async () => (await s.get(`/api/reviews/${first.json().id}`)).json().state === 'cancelled');
    await until(async () => (await pgrep(marker)) === 0);
    await sleep(300);
    expect(await pgrep(marker)).toBe(0);
    await s.close();
  });

  it('a result that arrives after Cancel is never reported as a success', async () => {
    let release!: (text: string) => void;
    const q = createJobQueue(() => new Promise<string>((res) => { release = res; }));
    const job = q.submit({ kind: 'review', blockId: 'b', paragraph: 'Everything beats everything else.' })!;
    await until(() => q.view(job.id)?.state === 'running');
    q.cancel(job.id);
    release(JSON.stringify({ findings: [{ category: 'logic', quote: 'Everything beats everything else.', critique: 'c', advice: 'a' }] }));
    await until(() => q.view(job.id)?.state === 'cancelled');
    expect(q.view(job.id)?.result).toBeUndefined();
  });

  it('runs editorial jobs on the editor runner and revisions on the reviser runner', async () => {
    const calls: string[] = [];
    const reply = (who: string, text: string) => async () => { calls.push(who); return text; };
    const q = createJobQueue({
      reviser: reply('reviser', JSON.stringify({ revised: 'Fine.', changes: [], declined: [] })),
      editor: reply('editor', JSON.stringify({ findings: [] })),
    });
    const a = q.submit({ paragraph: 'Fine.', intent: 'tighten' })!;
    const b = q.submit({ kind: 'review', blockId: 'b', paragraph: 'Fine.' })!;
    await until(() => q.view(a.id)?.state === 'succeeded' && q.view(b.id)?.state === 'succeeded');
    expect(calls).toEqual(['reviser', 'editor']);
    expect(q.view(b.id)?.result).toMatchObject({ blockId: 'b', sourceText: 'Fine.', findings: [], dropped: [], returned: 0 });
  });
});
