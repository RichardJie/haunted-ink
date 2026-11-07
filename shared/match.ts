import type { FieldCheck, Registered } from './types.ts';

export function fold(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[{}\\]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dice(a: string, b: string): number {
  const ta = fold(a).split(' ').filter(Boolean);
  const tb = fold(b).split(' ').filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const counts = new Map<string, number>();
  for (const t of tb) counts.set(t, (counts.get(t) ?? 0) + 1);
  let common = 0;
  for (const t of ta) {
    const n = counts.get(t) ?? 0;
    if (n > 0) { common++; counts.set(t, n - 1); }
  }
  return (2 * common) / (ta.length + tb.length);
}

export function titleMatches(claimed: string, registered: string): boolean {
  return fold(claimed) === fold(registered) || dice(claimed, registered) >= 0.9;
}

/** Family name from "Family, Given" or "Given Family". */
export function familyName(author: string): string {
  const a = author.trim();
  if (a.includes(',')) return a.split(',')[0].trim();
  const parts = a.split(/\s+/);
  return parts[parts.length - 1] ?? a;
}

interface CslName { family?: string; given?: string; literal?: string }
interface CslDate { 'date-parts'?: (number | string)[][] }
export interface Csl {
  title?: string | string[];
  author?: CslName[];
  issued?: CslDate;
  'published-print'?: CslDate;
  'published-online'?: CslDate;
  'container-title'?: string | string[];
  URL?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrOrStrs = (v: unknown) => typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
const isDate = (v: unknown) => isObj(v) && (v['date-parts'] === undefined ||
  (Array.isArray(v['date-parts']) && v['date-parts'].every((p) => Array.isArray(p) && p.every((x) => typeof x === 'number' || typeof x === 'string'))));
const isName = (v: unknown) => isObj(v) && ['family', 'given', 'literal'].every((k) => v[k] === undefined || typeof v[k] === 'string');

/**
 * Returns the value as CSL-JSON only if it is an object whose known fields have the expected types
 * and at least one identifying field (title, author or year). Anything else is untrusted: undefined.
 */
export function parseCsl(v: unknown): Csl | undefined {
  if (!isObj(v)) return undefined;
  for (const k of ['title', 'container-title'] as const) if (v[k] !== undefined && !isStrOrStrs(v[k])) return undefined;
  for (const k of ['issued', 'published-print', 'published-online'] as const) if (v[k] !== undefined && !isDate(v[k])) return undefined;
  if (v.author !== undefined && !(Array.isArray(v.author) && v.author.every(isName))) return undefined;
  if (v.URL !== undefined && typeof v.URL !== 'string') return undefined;
  const csl = v as Csl;
  const hasTitle = !!first(csl.title)?.trim();
  const hasAuthor = (csl.author ?? []).some((a) => a.family || a.literal);
  return hasTitle || hasAuthor || cslYears(csl).length ? csl : undefined;
}

function datePartYear(d?: CslDate): number | undefined {
  const y = d?.['date-parts']?.[0]?.[0];
  const n = typeof y === 'string' ? Number(y) : y;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);

export function cslYears(csl: Csl): number[] {
  return [csl.issued, csl['published-print'], csl['published-online']]
    .map(datePartYear)
    .filter((y): y is number => y !== undefined);
}

export function cslRegistered(csl: Csl): Registered {
  return {
    title: first(csl.title)?.replace(/<[^>]+>/g, '').trim(),
    authors: (csl.author ?? []).map((a) => a.literal ?? [a.family, a.given].filter(Boolean).join(', ')).filter(Boolean),
    year: cslYears(csl)[0],
    container: first(csl['container-title']),
    url: csl.URL,
  };
}

export interface Claim { title?: string; year?: number; firstAuthor?: string }

export function compareEntry(claim: Claim, csl: Csl): FieldCheck[] {
  const checks: FieldCheck[] = [];
  const reg = cslRegistered(csl);
  if (claim.title) {
    const rt = reg.title ?? '';
    checks.push({ field: 'title', claimed: claim.title, registered: rt, match: !!rt && titleMatches(claim.title, rt) });
  }
  if (claim.year !== undefined) {
    const years = cslYears(csl);
    checks.push({ field: 'year', claimed: String(claim.year), registered: [...new Set(years)].join(' / '), match: years.includes(claim.year) });
  }
  if (claim.firstAuthor) {
    const a = csl.author?.[0];
    const fam = a?.family ?? a?.literal ?? '';
    checks.push({ field: 'firstAuthor', claimed: claim.firstAuthor, registered: fam, match: !!fam && fold(familyName(claim.firstAuthor)) === fold(fam) });
  }
  return checks;
}
