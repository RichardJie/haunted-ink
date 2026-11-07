import type { Reference } from './types.ts';

export interface CitationToken {
  start: number;
  end: number;
  raw: string;
  keys: string[];
  numbers: number[];
}

const TOKEN = new RegExp(
  [
    String.raw`\[@[^\]\n]+\]`,
    String.raw`\\cite[pt]?\{[^}\n]*\}`,
    String.raw`\[\d+(?:\s*[-–]\s*\d+|\s*,\s*\d+)*\](?!\()`,
  ].join('|'),
  'g',
);

function expandNumbers(inner: string): number[] {
  const out: number[] = [];
  for (const part of inner.split(',')) {
    const range = /^\s*(\d+)\s*[-–]\s*(\d+)\s*$/.exec(part);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (b >= a && b - a <= 200) for (let n = a; n <= b; n++) out.push(n);
    } else if (/^\s*\d+\s*$/.test(part)) out.push(Number(part));
  }
  return out;
}

export function extractCitations(text: string): CitationToken[] {
  const tokens: CitationToken[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const raw = m[0];
    const start = m.index ?? 0;
    let keys: string[] = [];
    let numbers: number[] = [];
    if (raw.startsWith('[@')) {
      keys = raw.slice(1, -1).split(';').map((k) => k.trim().replace(/^@/, '')).filter(Boolean);
    } else if (raw.startsWith('\\cite')) {
      keys = raw.slice(raw.indexOf('{') + 1, -1).split(',').map((k) => k.trim()).filter(Boolean);
    } else {
      numbers = expandNumbers(raw.slice(1, -1));
    }
    tokens.push({ start, end: start + raw.length, raw, keys, numbers });
  }
  return tokens;
}

export interface LinkedToken extends CitationToken {
  linked: Reference[];
  unlinked: string[];
}

export function linkToken(token: CitationToken, refs: Reference[]): LinkedToken {
  const linked: Reference[] = [];
  const unlinked: string[] = [];
  for (const key of token.keys) {
    const r = refs.find((x) => x.key === key);
    if (r) linked.push(r); else unlinked.push(key);
  }
  for (const n of token.numbers) {
    const r = refs.find((x, i) => (x.number ?? i + 1) === n);
    if (r) linked.push(r); else unlinked.push(String(n));
  }
  return { ...token, linked, unlinked };
}
