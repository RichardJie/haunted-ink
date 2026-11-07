import { doiKey, isValidDoi, normalizeDoi } from '../shared/doi.ts';
import { compareEntry, cslRegistered, parseCsl, type Csl } from '../shared/match.ts';
import type { Verification, VerifyEntry } from '../shared/types.ts';

/**
 * Outbound policy. Handle lookups go to doi.org. Content negotiation on doi.org
 * answers with a redirect to the registration agency's metadata service (observed
 * 2026-11-06: Crossref -> api.crossref.org, DataCite -> data.crosscite.org). Only
 * these HTTPS hosts may be followed, at most 4 hops. No manuscript-supplied URL is ever fetched.
 */
export const DOI_HOST = 'doi.org';
export const AGENCY_HOSTS: Record<string, string> = {
  'api.crossref.org': 'Crossref',
  'data.crosscite.org': 'DataCite',
  'api.datacite.org': 'DataCite',
};

const OK_TTL = 24 * 3600_000;
const UNCERTAIN_TTL = 5 * 60_000;

export type Raw =
  | { kind: 'not_found' }
  | { kind: 'exists'; url?: string; agency?: string; csl?: Csl; metadataError?: string }
  | { kind: 'uncertain'; reason: string };

export interface Lookup { raw: Raw; at: number }

export interface DoiClientOptions {
  baseUrl?: string;
  /** Test-only: allow redirects to extra hosts and plain http (for a loopback fixture server). */
  extraHosts?: string[];
  timeoutMs?: number;
  concurrency?: number;
  /** Extra attempts after HTTP 429/503 (default 2), with Retry-After or a growing delay. */
  retries?: number;
  retryDelayMs?: number;
  now?: () => number;
}

export function createDoiClient(opts: DoiClientOptions = {}) {
  const base = opts.baseUrl ?? `https://${DOI_HOST}`;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const concurrency = opts.concurrency ?? 4;
  const retries = opts.retries ?? 2;
  const retryDelay = opts.retryDelayMs ?? 1000;
  const now = opts.now ?? Date.now;
  const baseHost = new URL(base).host;
  const cache = new Map<string, { at: number; ttl: number; raw: Raw }>();
  const inflight = new Map<string, Promise<Lookup>>();
  const insecureBase = base.startsWith('http:');
  const allowed = (u: URL) =>
    (u.host === baseHost && (u.protocol === 'https:' || insecureBase)) ||
    (u.protocol === 'https:' && u.host in AGENCY_HOSTS) ||
    (opts.extraHosts?.includes(u.host) ?? false);

  const enc = (doi: string) => doi.split('/').map(encodeURIComponent).join('/');

  async function get(url: string, headers: Record<string, string>): Promise<{ res: Response; finalUrl: URL }> {
    for (let attempt = 0; ; attempt++) {
      const out = await getOnce(url, headers);
      if ((out.res.status === 429 || out.res.status === 503) && attempt < retries) {
        const ra = Number(out.res.headers.get('retry-after'));
        const wait = Math.min(4000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : retryDelay * (attempt + 1));
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return out;
    }
  }

  async function getOnce(url: string, headers: Record<string, string>): Promise<{ res: Response; finalUrl: URL }> {
    let current = new URL(url);
    for (let hop = 0; hop < 5; hop++) {
      if (!allowed(current)) throw new Error(`redirect to unsupported host ${current.host}`);
      const res = await fetch(current, {
        headers: { 'User-Agent': 'HauntedInk/0.1 (local app)', ...headers },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location')!, current);
        continue;
      }
      return { res, finalUrl: current };
    }
    throw new Error('too many redirects');
  }

  async function fetchRaw(doi: string): Promise<Raw> {
    let handle: Response;
    try {
      handle = (await get(`${base}/api/handles/${enc(doi)}?type=URL`, { Accept: 'application/json' })).res;
    } catch (e) {
      return { kind: 'uncertain', reason: `doi.org not reachable (${reason(e)})` };
    }
    if (handle.status === 429 || handle.status >= 500) return { kind: 'uncertain', reason: `doi.org answered HTTP ${handle.status}` };
    // Only a well-formed Handle API object with responseCode 100 proves that a DOI does not exist.
    // HTML error pages, null, arrays and unknown codes (even with HTTP 404) stay uncertain.
    let body: unknown;
    try { body = await handle.json(); } catch {
      return { kind: 'uncertain', reason: `doi.org returned an unreadable answer (HTTP ${handle.status})` };
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { kind: 'uncertain', reason: `doi.org returned an unexpected answer (HTTP ${handle.status})` };
    }
    const code = (body as { responseCode?: unknown }).responseCode;
    if (code === 100) return { kind: 'not_found' };
    if (code !== 1) return { kind: 'uncertain', reason: `doi.org returned response code ${typeof code === 'number' ? code : 'missing'}` };
    const values = (body as { values?: unknown }).values;
    const urlValue = Array.isArray(values)
      ? (values.find((v) => v && typeof v === 'object' && v.type === 'URL') as { data?: { value?: unknown } } | undefined)?.data?.value
      : undefined;
    const url = typeof urlValue === 'string' ? urlValue : undefined;
    try {
      const { res, finalUrl } = await get(`${base}/${enc(doi)}`, { Accept: 'application/vnd.citationstyles.csl+json' });
      const agency = AGENCY_HOSTS[finalUrl.host];
      if (!res.ok) return { kind: 'exists', url, agency, metadataError: `metadata service answered HTTP ${res.status}` };
      let json: unknown;
      try { json = await res.json(); } catch { return { kind: 'exists', url, agency, metadataError: 'metadata was not valid JSON' }; }
      const csl = parseCsl(json);
      if (!csl) return { kind: 'exists', url, agency, metadataError: 'metadata had an unexpected shape' };
      return { kind: 'exists', url, agency, csl };
    } catch (e) {
      return { kind: 'exists', url, metadataError: reason(e) };
    }
  }

  /** Resolves with the raw lookup and the time it was actually fetched (kept on cache hits). */
  function lookup(doi: string, force: boolean): Promise<Lookup> {
    const key = doiKey(doi);
    const hit = cache.get(key);
    if (!force && hit && now() - hit.at < hit.ttl) return Promise.resolve({ raw: hit.raw, at: hit.at });
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = fetchRaw(normalizeDoi(doi))
      .catch((e): Raw => ({ kind: 'uncertain', reason: `lookup failed (${reason(e)})` }))
      .then((raw) => {
        const definitive = raw.kind === 'not_found' || (raw.kind === 'exists' && raw.csl);
        const at = now();
        cache.set(key, { at, ttl: definitive ? OK_TTL : UNCERTAIN_TTL, raw });
        return { raw, at };
      }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  /** The comparison is recomputed for every entry; only raw lookups are cached. `at` is the lookup time. */
  function judge(entry: VerifyEntry, raw: Raw, at: number = now()): Verification {
    const checkedAt = new Date(at).toISOString();
    const base: Verification = { status: 'uncertain', provider: 'doi.org', checkedAt };
    if (raw.kind === 'not_found') return { ...base, status: 'not_found', reason: 'doi.org has no record of this identifier' };
    if (raw.kind === 'uncertain') return { ...base, reason: raw.reason };
    if (!raw.csl) {
      return { ...base, agency: raw.agency, reason: `exists, metadata unavailable${raw.metadataError ? ` (${raw.metadataError})` : ''}`, registered: raw.url ? { url: raw.url } : undefined };
    }
    const registered = cslRegistered(raw.csl);
    const fields = compareEntry({ title: entry.title, year: entry.year, firstAuthor: entry.firstAuthor }, raw.csl);
    const agency = raw.agency;
    if (!fields.length) return { ...base, status: 'verified', agency, registered, reason: 'identifier exists; no fields to compare' };
    const bad = fields.filter((f) => !f.match);
    if (bad.length) return { ...base, status: 'mismatch', agency, registered, fields, reason: `differs: ${bad.map((f) => f.field).join(', ')}` };
    return { ...base, status: 'verified', agency, registered, fields };
  }

  async function verify(entries: VerifyEntry[], force = false): Promise<Record<string, Verification>> {
    const out: Record<string, Verification> = {};
    const queue = [...entries];
    const worker = async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        const doi = normalizeDoi(e.doi);
        if (!isValidDoi(doi)) {
          out[e.id] = { status: 'invalid_doi', reason: 'Not a DOI of the form 10.NNNN/suffix', checkedAt: new Date(now()).toISOString() };
          continue;
        }
        const { raw, at } = await lookup(doi, force);
        out[e.id] = judge(e, raw, at);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
    return out;
  }

  return { verify, lookup, judge, cache };
}

function reason(e: unknown): string {
  if (e instanceof Error) return e.name === 'TimeoutError' ? 'timed out' : e.message;
  return String(e);
}

export type DoiClient = ReturnType<typeof createDoiClient>;
