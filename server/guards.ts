import type { IncomingMessage, ServerResponse } from 'node:http';
import { LIMITS } from '../shared/editorial.ts';
import type { DraftRequest, ReviewRequest, StructureRequest } from './kiro/tasks.ts';

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const MAX_BODY = 64 * 1024;

export function appOrigins(port: number): string[] {
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

/** Host, Sec-Fetch-Site, Origin and Content-Type checks. Throws HttpError. */
export function checkRequest(req: IncomingMessage, port: number): void {
  const host = req.headers.host ?? '';
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(host)) throw new HttpError(403, 'bad_host', 'This app only answers on 127.0.0.1 or localhost.');
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'cross_site', 'Cross-site requests are refused.');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.origin;
    if (!origin || !appOrigins(port).includes(origin)) throw new HttpError(403, 'bad_origin', 'Requests must come from this app.');
    const ct = req.headers['content-type'] ?? '';
    if (!ct.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'bad_content_type', 'Content-Type must be application/json.');
  }
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_BODY) throw new HttpError(413, 'too_large', 'Request body is larger than 64 KB.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'too_large', 'Request body is larger than 64 KB.');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
    throw new HttpError(400, 'bad_json', 'Request body is not valid JSON.');
  }
}

export function securityHeaders(dev: boolean): Record<string, string> {
  const csp = dev
    ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    : "default-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

// ---- hand-written schema checks ----
type Obj = Record<string, unknown>;
const bad = (m: string) => new HttpError(400, 'bad_request', m);

function obj(v: unknown): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw bad('Expected a JSON object.');
  return v as Obj;
}
function str(v: unknown, name: string, max: number, required = true): string | undefined {
  if (v === undefined || v === null || v === '') { if (required) throw bad(`"${name}" is required.`); return undefined; }
  if (typeof v !== 'string') throw bad(`"${name}" must be text.`);
  if (v.length > max) throw bad(`"${name}" is longer than ${max} characters.`);
  return v;
}

export interface VerifyBody { references: { id: string; doi: string; title?: string; year?: number; firstAuthor?: string }[]; force: boolean }

export function parseVerifyBody(raw: unknown): VerifyBody {
  const b = obj(raw);
  if (!Array.isArray(b.references)) throw bad('"references" must be a list.');
  if (b.references.length > 50) throw bad('At most 50 references can be checked at once.');
  const references = b.references.map((r) => {
    const o = obj(r);
    const year = o.year;
    if (year !== undefined && year !== null && (!Number.isInteger(year) || (year as number) < 1000 || (year as number) > 2200)) throw bad('"year" must be a four-digit year.');
    return {
      id: str(o.id, 'id', 80)!,
      doi: str(o.doi, 'doi', 300)!,
      title: str(o.title, 'title', 600, false),
      year: typeof year === 'number' ? year : undefined,
      firstAuthor: str(o.firstAuthor, 'firstAuthor', 200, false),
    };
  });
  return { references, force: b.force === true };
}

export interface RevisionBody { paragraph: string; heading?: string; intent: string }

export function parseRevisionBody(raw: unknown): RevisionBody {
  const b = obj(raw);
  const paragraph = str(b.paragraph, 'paragraph', 4000)!;
  if (!paragraph.trim()) throw bad('The paragraph is empty.');
  const intent = str(b.intent, 'intent', 500)!;
  if (!intent.trim()) throw bad('Write what you want Kiro to do with this paragraph.');
  return { paragraph, intent, heading: str(b.heading, 'heading', 300, false) };
}

// ---- editorial bodies ----

function keyList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 100) throw bad('"knownKeys" must be a list of at most 100 citation keys.');
  return v.map((k) => {
    if (typeof k !== 'string' || k.length > 80) throw bad('Each citation key must be text of at most 80 characters.');
    return k;
  });
}

export function parseOutlineBody(raw: unknown): StructureRequest {
  const b = obj(raw);
  const notes = str(b.notes, 'notes', LIMITS.notesChars)!;
  if (!notes.trim()) throw bad('The notes are empty. Write or load some notes first.');
  return { notes, knownKeys: keyList(b.knownKeys) };
}

export function parseDraftBody(raw: unknown): DraftRequest {
  const b = obj(raw);
  const item = obj(b.item);
  const brief = str(item.brief, 'item.brief', LIMITS.briefChars)!;
  if (!brief.trim()) throw bad('The section brief is empty. Say what this paragraph should argue.');
  const evidenceRaw = item.evidence ?? [];
  if (!Array.isArray(evidenceRaw) || evidenceRaw.length > 12) throw bad('"item.evidence" must be a list of at most 12 claims.');
  const evidence = evidenceRaw.map((e) => {
    const o = obj(e);
    const status = o.status === 'cited' ? 'cited' : 'needed';
    return { claim: str(o.claim, 'claim', LIMITS.claimChars)!, status: status as 'cited' | 'needed', keys: keyList(o.keys) };
  });
  return {
    item: { heading: str(item.heading, 'item.heading', LIMITS.headingChars, false) ?? '', brief, evidence },
    notes: str(b.notes, 'notes', LIMITS.notesChars, false) ?? '',
    knownKeys: keyList(b.knownKeys),
    before: str(b.before, 'before', 4000, false) ?? '',
    after: str(b.after, 'after', 4000, false) ?? '',
  };
}

export function parseReviewBody(raw: unknown): ReviewRequest {
  const b = obj(raw);
  const paragraph = str(b.paragraph, 'paragraph', 4000)!;
  if (!paragraph.trim()) throw bad('The paragraph is empty.');
  return { blockId: str(b.blockId, 'blockId', 80)!, paragraph, heading: str(b.heading, 'heading', 300, false) };
}
