import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.ts';
import { createDoiClient } from '../../server/doi.ts';
import type { Health } from '../../server/kiro/runner.ts';
import { freePort, jsonHeaders, raw } from './helpers.ts';

let port = 0;
let app: ReturnType<typeof createApp>;
let health: Health = { kiro: 'ready', version: 'test' };

beforeAll(async () => {
  port = await freePort();
  app = createApp({ port, run: () => new Promise(() => {}), health: async () => health, doi: createDoiClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 300 }) });
  await new Promise<void>((r) => app.server.listen(port, '127.0.0.1', r));
});
afterAll(async () => { app.server.close(); await app.shutdown(); });

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  raw(port, { method: 'POST', path, headers: { ...jsonHeaders(port), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('request guards (R8.1 to R8.3)', () => {
  it('answers a good GET with security headers and no CORS headers', async () => {
    const r = await raw(port, { path: '/api/health', headers: { Host: `127.0.0.1:${port}` } });
    expect(r.status).toBe(200);
    expect(r.json()).toMatchObject({ kiro: 'ready', doiHost: 'doi.org' });
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(Object.keys(r.headers).filter((h) => h.startsWith('access-control-'))).toEqual([]);
  });
  it('accepts localhost as Host too', async () => {
    expect((await raw(port, { path: '/api/health', headers: { Host: `localhost:${port}` } })).status).toBe(200);
  });
  it('rejects a bad Host', async () => {
    expect((await raw(port, { path: '/api/health', headers: { Host: 'evil.example' } })).status).toBe(403);
    expect((await raw(port, { path: '/api/health', headers: { Host: `127.0.0.1:${port + 1}` } })).status).toBe(403);
  });
  it('rejects a missing or foreign Origin on POST', async () => {
    const h = jsonHeaders(port);
    delete h.Origin;
    expect((await raw(port, { method: 'POST', path: '/api/citations/verify', headers: h, body: '{"references":[]}' })).status).toBe(403);
    expect((await post('/api/citations/verify', { references: [] }, { Origin: 'http://evil.example' })).status).toBe(403);
  });
  it('rejects a wrong Content-Type', async () => {
    expect((await post('/api/citations/verify', 'references=1', { 'Content-Type': 'text/plain' })).status).toBe(415);
  });
  it('rejects a body over 64 KB', async () => {
    const r = await post('/api/citations/verify', JSON.stringify({ references: [], pad: 'x'.repeat(65 * 1024) }));
    expect(r.status).toBe(413);
  });
  it('rejects Sec-Fetch-Site: cross-site', async () => {
    expect((await post('/api/citations/verify', { references: [] }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await raw(port, { path: '/api/health', headers: { Host: `127.0.0.1:${port}`, 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
  });
  it('accepts same-origin POST and validates the schema', async () => {
    expect((await post('/api/citations/verify', { references: [] }, { 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
    expect((await post('/api/citations/verify', '{bad')).status).toBe(400);
    expect((await post('/api/citations/verify', { references: 'x' })).status).toBe(400);
    expect((await post('/api/citations/verify', { references: Array.from({ length: 51 }, (_, i) => ({ id: `${i}`, doi: '10.1000/x' })) })).status).toBe(400);
  });
  it('validates revision requests (R4.2)', async () => {
    expect((await post('/api/revisions', { paragraph: 'ok', intent: '  ' })).status).toBe(400);
    expect((await post('/api/revisions', { paragraph: 'x'.repeat(4001), intent: 'tighten' })).status).toBe(400);
    expect((await post('/api/revisions', { paragraph: 'ok', intent: 'x'.repeat(501) })).status).toBe(400);
  });
  it('explains when Kiro is logged out', async () => {
    health = { kiro: 'logged_out', detail: 'Run `kiro-cli login` in a terminal.' };
    const r = await post('/api/revisions', { paragraph: 'ok', intent: 'tighten' });
    expect(r.status).toBe(503);
    expect(r.json().fix).toContain('kiro-cli login');
    health = { kiro: 'ready' };
  });
  it('reports DOI network trouble as uncertain, never not_found', async () => {
    const r = await post('/api/citations/verify', { references: [{ id: 'x', doi: '10.1000/x' }] });
    expect(r.json().results.x.status).toBe('uncertain');
  });
});
