import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createDoiClient } from '../../server/doi.ts';

// A loopback stand-in for doi.org's wire protocol, used only to test error handling and caching.
// The real service is exercised by tests/live/doi.live.test.ts.
interface Fake { base: string; hits: string[] }
let open: Server[] = [];
afterEach(() => { open.forEach((s) => s.close()); open = []; });

type Handler = (url: string, accept: string) => { status?: number; body?: unknown; headers?: Record<string, string>; hang?: boolean };

async function fake(handler: Handler): Promise<Fake> {
  const hits: string[] = [];
  const s = createServer((req, res) => {
    hits.push(req.url ?? '');
    const r = handler(req.url ?? '', String(req.headers.accept));
    if (r.hang) return;
    res.writeHead(r.status ?? 200, { 'Content-Type': 'application/json', ...r.headers });
    res.end(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}));
  });
  open.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as { port: number };
  return { base: `http://127.0.0.1:${port}`, hits };
}

const csl = { title: 'Long Short-Term Memory', author: [{ family: 'Hochreiter' }], issued: { 'date-parts': [[1997]] } };
const handle = { body: { responseCode: 1, values: [{ type: 'URL', data: { value: 'https://example.org' } }] } };
const happy: Handler = (url, accept) => (url.startsWith('/api/handles/') ? handle : accept.includes('csl') ? { body: csl } : { status: 404 });

describe('DOI raw cache, per-entry verdicts', () => {
  it('REGRESSION: the same DOI with a wrong title after a correct title is a mismatch', async () => {
    const f = await fake(happy);
    const c = createDoiClient({ baseUrl: f.base });
    const good = await c.verify([{ id: 'a', doi: '10.1162/neco.1997.9.8.1735', title: 'Long Short-Term Memory', year: 1997 }]);
    expect(good.a.status).toBe('verified');
    const hitsAfterFirst = f.hits.length;
    const wrong = await c.verify([{ id: 'b', doi: '10.1162/NECO.1997.9.8.1735', title: 'Completely Different Paper' }]);
    expect(wrong.b.status).toBe('mismatch');
    expect(wrong.b.fields?.find((x) => x.field === 'title')?.match).toBe(false);
    expect(f.hits.length).toBe(hitsAfterFirst); // second verdict came from cached raw metadata
  });
  it('mismatch first, then a correct entry for the same DOI verifies', async () => {
    const f = await fake(happy);
    const c = createDoiClient({ baseUrl: f.base });
    expect((await c.verify([{ id: 'a', doi: '10.1000/xyz', year: 1998 }])).a.status).toBe('mismatch');
    expect((await c.verify([{ id: 'a', doi: '10.1000/xyz', year: 1997 }])).a.status).toBe('verified');
  });
  it('force bypasses the cache', async () => {
    const f = await fake(happy);
    const c = createDoiClient({ baseUrl: f.base });
    await c.verify([{ id: 'a', doi: '10.1000/xyz' }]);
    const n = f.hits.length;
    await c.verify([{ id: 'a', doi: '10.1000/xyz' }], true);
    expect(f.hits.length).toBe(n * 2);
  });
  it('uncertain results are cached only 5 minutes', async () => {
    let t = 0;
    const f = await fake(() => ({ status: 503 }));
    const c = createDoiClient({ baseUrl: f.base, now: () => t, retries: 0 });
    await c.verify([{ id: 'a', doi: '10.1000/xyz' }]);
    await c.verify([{ id: 'a', doi: '10.1000/xyz' }]);
    expect(f.hits.length).toBe(1);
    t = 5 * 60_000 + 1;
    await c.verify([{ id: 'a', doi: '10.1000/xyz' }]);
    expect(f.hits.length).toBe(2);
  });
  it('requests a DOI with parentheses intact', async () => {
    const f = await fake(happy);
    await createDoiClient({ baseUrl: f.base }).verify([{ id: 'a', doi: 'https://doi.org/10.1016/S0006-3495(76)85000-1' }]);
    expect(f.hits[0]).toBe('/api/handles/10.1016/S0006-3495(76)85000-1?type=URL');
  });
});

describe('DOI rate limits', () => {
  it('retries a 429 from the metadata service and then verifies', async () => {
    let limited = true;
    const f = await fake((url, accept) => {
      if (url.startsWith('/api/handles/')) return handle;
      if (limited) { limited = false; return { status: 429 }; }
      return accept.includes('csl') ? { body: csl } : { status: 404 };
    });
    const r = (await createDoiClient({ baseUrl: f.base, retryDelayMs: 1 }).verify([{ id: 'a', doi: '10.1000/x', year: 1997 }])).a;
    expect(r.status).toBe('verified');
  });
});

describe('DOI error handling (R3.4 to R3.6)', () => {
  it('responseCode 100 is not_found', async () => {
    const f = await fake(() => ({ body: { responseCode: 100 } }));
    expect((await createDoiClient({ baseUrl: f.base }).verify([{ id: 'a', doi: '10.1000/none' }])).a.status).toBe('not_found');
  });
  it.each([[429], [500], [503]])('HTTP %i is uncertain, not not_found', async (status) => {
    const f = await fake(() => ({ status }));
    const r = (await createDoiClient({ baseUrl: f.base, retries: 1, retryDelayMs: 1 }).verify([{ id: 'a', doi: '10.1000/x' }])).a;
    expect(r.status).toBe('uncertain');
    expect(r.reason).toContain(String(status));
    expect(f.hits.length).toBe(status === 500 ? 1 : 2); // 429 and 503 get one retry; 500 does not
  });
  it('an unparseable body is uncertain', async () => {
    const f = await fake(() => ({ body: '<html>oops' }));
    expect((await createDoiClient({ baseUrl: f.base }).verify([{ id: 'a', doi: '10.1000/x' }])).a.status).toBe('uncertain');
  });
  it.each([
    ['an HTML 404 page', { status: 404, body: '<html><body>Not Found</body></html>' }],
    ['JSON null', { body: 'null' }],
    ['a JSON array', { body: '[]' }],
    ['an object without responseCode', { status: 404, body: {} }],
    ['an unknown responseCode', { body: { responseCode: 2 } }],
    ['a string responseCode 100', { status: 404, body: { responseCode: '100' } }],
  ])('REGRESSION: handle answer that is %s is uncertain, never not_found', async (_label, answer) => {
    const f = await fake(() => answer);
    const r = (await createDoiClient({ baseUrl: f.base }).verify([{ id: 'a', doi: '10.1000/x' }])).a;
    expect(r.status).toBe('uncertain');
  });
  it('HTTP 404 with a valid responseCode 100 is not_found', async () => {
    const f = await fake(() => ({ status: 404, body: { responseCode: 100 } }));
    expect((await createDoiClient({ baseUrl: f.base }).verify([{ id: 'a', doi: '10.1000/none' }])).a.status).toBe('not_found');
  });
  it.each([
    ['{}', {}],
    ['null', 'null'],
    ['an array', '[{"title":"Long Short-Term Memory"}]'],
    ['a numeric title', { title: 42, issued: { 'date-parts': [[1997]] } }],
    ['author as a string', { title: 'Long Short-Term Memory', author: 'Hochreiter' }],
    ['malformed date-parts', { title: 'Long Short-Term Memory', issued: { 'date-parts': 1997 } }],
    ['invalid JSON', '{"title": '],
  ])('REGRESSION: CSL metadata that is %s is never verified', async (_label, meta) => {
    const f = await fake((url) => (url.startsWith('/api/handles/') ? handle : { body: meta }));
    const c = createDoiClient({ baseUrl: f.base });
    const r = (await c.verify([{ id: 'a', doi: '10.1000/x' }, { id: 'b', doi: '10.1000/y', title: 'Long Short-Term Memory', year: 1997 }]));
    for (const v of Object.values(r)) {
      expect(v.status).toBe('uncertain');
      expect(v.reason).toContain('exists, metadata unavailable');
    }
  });
  it('REGRESSION: a cache hit keeps the real lookup time; force refreshes it', async () => {
    let t = Date.parse('2026-11-06T10:00:00Z');
    const f = await fake(happy);
    const c = createDoiClient({ baseUrl: f.base, now: () => t });
    const first = (await c.verify([{ id: 'a', doi: '10.1000/x', year: 1997 }])).a;
    expect(first.checkedAt).toBe('2026-11-06T10:00:00.000Z');
    t += 60 * 60_000;
    const cached = (await c.verify([{ id: 'a', doi: '10.1000/x', year: 1997 }])).a;
    expect(cached.checkedAt).toBe('2026-11-06T10:00:00.000Z');
    const forced = (await c.verify([{ id: 'a', doi: '10.1000/x', year: 1997 }], true)).a;
    expect(forced.checkedAt).toBe('2026-11-06T11:00:00.000Z');
  });
  it('a timeout is uncertain', async () => {
    const f = await fake(() => ({ hang: true }));
    const r = (await createDoiClient({ baseUrl: f.base, timeoutMs: 250 }).verify([{ id: 'a', doi: '10.1000/x' }])).a;
    expect(r.status).toBe('uncertain');
    expect(r.reason).toMatch(/timed out/);
  });
  it('an unreachable host is uncertain', async () => {
    const r = (await createDoiClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 }).verify([{ id: 'a', doi: '10.1000/x' }])).a;
    expect(r.status).toBe('uncertain');
  });
  it('an existing DOI with unavailable metadata says so', async () => {
    const f = await fake((url) => (url.startsWith('/api/handles/') ? handle : { status: 404 }));
    const r = (await createDoiClient({ baseUrl: f.base }).verify([{ id: 'a', doi: '10.1000/x' }])).a;
    expect(r.status).toBe('uncertain');
    expect(r.reason).toContain('exists, metadata unavailable');
    expect(r.registered?.url).toBe('https://example.org');
  });
  it('refuses redirects to hosts outside the allowlist', async () => {
    const f = await fake((url) => (url.startsWith('/api/handles/') ? handle : { status: 302, headers: { Location: 'https://evil.example/steal' } }));
    const r = (await createDoiClient({ baseUrl: f.base }).verify([{ id: 'a', doi: '10.1000/x' }])).a;
    expect(r.status).toBe('uncertain');
    expect(r.reason).toContain('unsupported host');
  });
  it('invalid DOIs never reach the network', async () => {
    const f = await fake(happy);
    const r = (await createDoiClient({ baseUrl: f.base }).verify([{ id: 'a', doi: '10.12/short' }])).a;
    expect(r.status).toBe('invalid_doi');
    expect(f.hits).toEqual([]);
  });
  it('runs at most four lookups at a time', async () => {
    let active = 0;
    let peak = 0;
    const s = createServer((_req, res) => {
      active++; peak = Math.max(peak, active);
      setTimeout(() => { active--; res.writeHead(200); res.end(JSON.stringify({ responseCode: 100 })); }, 60);
    });
    open.push(s);
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
    await createDoiClient({ baseUrl: base }).verify(Array.from({ length: 12 }, (_, i) => ({ id: `${i}`, doi: `10.1000/n${i}` })));
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });
});
