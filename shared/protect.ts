import { extractCitations } from './citations.ts';
import { DOI_FIND, trimTail } from './doi.ts';

const URL_RE = /https?:\/\/[^\s<>"]+/g;
const NUMBER_RE = /(?<![A-Za-z\d])\d+(?:[.,]\d+)*%?/g;
const AUTHOR_YEAR = [
  /\b[A-Z][A-Za-z-]+ (?:et al\.?|and [A-Z][A-Za-z-]+),? \(?(?:19|20)\d{2}[a-z]?\)?/g,
  /\b[A-Z][A-Za-z-]+,? \((?:19|20)\d{2}[a-z]?\)/g,
  /\([A-Z][A-Za-z-]+,? (?:19|20)\d{2}[a-z]?\)/g,
];
const PLACEHOLDER_RE = /⟦[^⟧]*⟧/g;

/** Whole URL candidates with trailing punctuation and unbalanced closers removed. */
function urlMatches(text: string): { index: number; raw: string }[] {
  return [...text.matchAll(URL_RE)].map((m) => ({ index: m.index ?? 0, raw: trimTail(m[0]) })).filter((u) => u.raw.length > 0);
}

interface Span { start: number; end: number; raw: string }

function overlaps(spans: Span[], s: Span): boolean {
  return spans.some((x) => s.start < x.end && x.start < s.end);
}

export interface Protected {
  text: string;
  tokens: string[];
  placeholders: string[];
}

export function protect(input: string): Protected {
  const spans: Span[] = [];
  const add = (start: number, raw: string) => {
    const s = { start, end: start + raw.length, raw };
    if (raw && !overlaps(spans, s)) spans.push(s);
  };
  for (const u of urlMatches(input)) add(u.index, u.raw);
  const doiGlobal = new RegExp(DOI_FIND.source, 'g');
  for (const m of input.matchAll(doiGlobal)) add(m.index ?? 0, trimTail(m[0]));
  for (const t of extractCitations(input)) add(t.start, t.raw);
  for (const m of input.matchAll(NUMBER_RE)) add(m.index ?? 0, m[0]);
  spans.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  const tokens: string[] = [];
  const placeholders: string[] = [];
  for (const s of spans) {
    out += input.slice(pos, s.start);
    const ph = `⟦C${tokens.length + 1}⟧`;
    out += ph;
    tokens.push(s.raw);
    placeholders.push(ph);
    pos = s.end;
  }
  out += input.slice(pos);
  return { text: out, tokens, placeholders };
}

export type PlaceholderCheck = { ok: true } | { ok: false; problem: string };

export function checkPlaceholders(revised: string, placeholders: string[]): PlaceholderCheck {
  const found = revised.match(PLACEHOLDER_RE) ?? [];
  const counts = new Map<string, number>();
  for (const f of found) counts.set(f, (counts.get(f) ?? 0) + 1);
  for (const ph of placeholders) {
    const n = counts.get(ph) ?? 0;
    if (n === 0) return { ok: false, problem: `The revision dropped the protected token ${ph}.` };
    if (n > 1) return { ok: false, problem: `The revision repeated the protected token ${ph}.` };
  }
  for (const f of counts.keys()) {
    if (!placeholders.includes(f)) return { ok: false, problem: `The revision invented the token ${f}.` };
  }
  return { ok: true };
}

export function restore(revised: string, p: Protected): string {
  return revised.replace(PLACEHOLDER_RE, (ph) => {
    const i = p.placeholders.indexOf(ph);
    return i >= 0 ? p.tokens[i] : ph;
  });
}

export interface Flag { kind: 'number' | 'year' | 'doi' | 'url' | 'citation'; value: string }

function facts(text: string): Flag[] {
  const out: Flag[] = [];
  const seen = new Set<string>();
  const push = (kind: Flag['kind'], value: string) => {
    const k = `${kind}:${value}`;
    if (!seen.has(k)) { seen.add(k); out.push({ kind, value }); }
  };
  for (const u of urlMatches(text)) push('url', u.raw);
  for (const m of text.matchAll(new RegExp(DOI_FIND.source, 'g'))) push('doi', trimTail(m[0]).toLowerCase());
  for (const t of extractCitations(text)) push('citation', t.raw);
  for (const re of AUTHOR_YEAR) for (const m of text.matchAll(re)) push('citation', m[0]);
  for (const m of text.matchAll(NUMBER_RE)) {
    const v = m[0].replace(/[.,]+$/, '');
    push(/^(?:19|20)\d{2}$/.test(v) ? 'year' : 'number', v);
  }
  return out;
}

/** Facts (numbers, years, DOIs, URLs, citation-like strings) present only in the revision. */
export function flagNewFacts(original: string, revised: string): Flag[] {
  const had = new Set(facts(original).map((f) => `${f.kind}:${f.value}`));
  const hadValue = new Set(facts(original).map((f) => f.value));
  return facts(revised).filter((f) => !had.has(`${f.kind}:${f.value}`) && !(f.kind !== 'citation' && hadValue.has(f.value)));
}
