import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createDoiClient, type DoiClient } from './doi.ts';
import { HttpError, checkRequest, parseDraftBody, parseOutlineBody, parseReviewBody, parseRevisionBody, parseVerifyBody, readJson, securityHeaders, sendJson } from './guards.ts';
import { createJobQueue, type JobRequest, type Runners } from './kiro/queue.ts';
import type { JobKind } from '../shared/types.ts';
import type { Health } from './kiro/runner.ts';
import { serveStatic } from './static.ts';

export interface AppDeps {
  port: number;
  dev?: boolean;
  doi?: DoiClient;
  run: Runners;
  health: () => Promise<Health>;
  staticRoot?: string;
  /** Dev only: Vite connect middleware. */
  vite?: (req: IncomingMessage, res: ServerResponse, next: (e?: unknown) => void) => void;
  queueOptions?: { timeoutMs?: number; maxQueued?: number };
}

const ROUTES: { path: string; kind: JobKind; what: string; parse: (raw: unknown) => object }[] = [
  { path: '/api/revisions', kind: 'revision', what: 'revision', parse: parseRevisionBody },
  { path: '/api/outline', kind: 'structure', what: 'outline request', parse: parseOutlineBody },
  { path: '/api/drafts', kind: 'draft', what: 'draft', parse: parseDraftBody },
  { path: '/api/reviews', kind: 'review', what: 'review', parse: parseReviewBody },
];

export function createApp(deps: AppDeps): { server: Server; shutdown: () => Promise<void> } {
  const doi = deps.doi ?? createDoiClient();
  const queue = createJobQueue(deps.run, deps.queueOptions);
  const headers = securityHeaders(!!deps.dev);

  async function api(req: IncomingMessage, res: ServerResponse, path: string) {
    const method = req.method ?? 'GET';
    if (path === '/api/health' && method === 'GET') {
      const h = await deps.health();
      return sendJson(res, 200, { ...h, doiHost: 'doi.org', runtime: 'local' });
    }
    if (path === '/api/citations/verify' && method === 'POST') {
      const body = parseVerifyBody(await readJson(req));
      const results = await doi.verify(body.references, body.force);
      return sendJson(res, 200, { results });
    }
    const route = ROUTES.find((r) => path === r.path || path.startsWith(`${r.path}/`));
    if (route) {
      if (path === route.path && method === 'POST') {
        const request = { ...route.parse(await readJson(req)), kind: route.kind } as JobRequest;
        const h = await deps.health();
        if (h.kiro === 'missing' || h.kiro === 'logged_out') {
          return sendJson(res, 503, { error: h.kiro, message: h.kiro === 'missing' ? 'The kiro-cli command was not found.' : 'Kiro CLI is not logged in.', fix: h.detail });
        }
        const job = queue.submit(request);
        if (!job) return sendJson(res, 429, { error: 'busy', message: 'Kiro is busy and the queue is full. Wait a moment and try again.' });
        return sendJson(res, 202, job);
      }
      const m = /^\/api\/[a-z]+\/([0-9a-f-]{36})$/.exec(path);
      if (m) {
        const gone = () => sendJson(res, 404, { error: 'not_found', message: `That ${route.what} is no longer available.` });
        if (method === 'GET') {
          const v = queue.view(m[1], route.kind);
          return v ? sendJson(res, 200, v) : gone();
        }
        if (method === 'DELETE') {
          await readJson(req);
          return queue.cancel(m[1], route.kind) ? sendJson(res, 200, { ok: true }) : gone();
        }
      }
    }
    throw new HttpError(404, 'not_found', 'No such endpoint.');
  }

  const server = createServer(async (req, res) => {
    try {
      checkRequest(req, deps.port);
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      const path = (req.url ?? '/').split('?')[0];
      if (path.startsWith('/api/')) return await api(req, res, path);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method', 'Method not allowed.');
      if (deps.vite) return deps.vite(req, res, (e) => { if (!res.headersSent) sendJson(res, 500, { error: 'dev', message: String(e) }); });
      if (deps.staticRoot && (await serveStatic(deps.staticRoot, path, res, headers))) return;
      throw new HttpError(404, 'not_found', 'Not found.');
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) return sendJson(res, e.status, { error: e.code, message: e.message });
      console.error('[haunted-ink] internal error:', e instanceof Error ? e.message : e);
      sendJson(res, 500, { error: 'internal', message: 'Something went wrong in the local server.' });
    }
  });
  server.requestTimeout = 60_000;
  return { server, shutdown: () => queue.shutdown() };
}
