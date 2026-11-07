// Pure contracts for the ghost editorial room: word count and candle progress,
// review staleness, and validators for the three Kiro outputs (outline, draft, review).
// Validators never repair or invent content: they keep what is well-formed and say what was dropped.
import { extractCitations } from './citations.ts';
import type { Block, EvidenceNeed, GhostCategory, GhostFinding, GhostReview, OutlineItem } from './types.ts';

export const LIMITS = {
  notesChars: 20_000,
  outlineItems: 12,
  headingChars: 120,
  briefChars: 600,
  evidencePerItem: 4,
  claimChars: 240,
  draftChars: 2_500,
  draftEvidence: 6,
  findings: 5,
  quoteMin: 3,
  quoteChars: 300,
  critiqueChars: 280,
  adviceChars: 280,
  wordGoalMin: 50,
  wordGoalMax: 200_000,
} as const;

export const DEFAULT_WORD_GOAL = 1500;
export const GHOST_CATEGORIES: GhostCategory[] = ['logic', 'evidence', 'clarity'];

/** Placeholder a draft (or the author) uses where a source is still required. */
export const EVIDENCE_MARK = /\[evidence needed:[^\]\n]*\]/gi;
export const evidenceMark = (claim: string) => `[evidence needed: ${claim.replace(/[\]\n]/g, ' ').trim()}]`;

const isHeadingText = (t: string) => /^#{1,6}\s/.test(t.trimStart());

/** Words of prose: citation tokens and evidence markers are not words; a word has a letter or digit. */
export function countWords(text: string): number {
  let t = text;
  for (const c of [...extractCitations(text)].reverse()) t = t.slice(0, c.start) + ' ' + t.slice(c.end);
  t = t.replace(EVIDENCE_MARK, ' ');
  return t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Body word count: headings are excluded. */
export const bodyWords = (blocks: Block[]): number => blocks.reduce((n, b) => (isHeadingText(b.text) ? n : n + countWords(b.text)), 0);

export const clampGoal = (n: number): number =>
  Number.isFinite(n) ? Math.min(LIMITS.wordGoalMax, Math.max(LIMITS.wordGoalMin, Math.round(n))) : DEFAULT_WORD_GOAL;

export interface CandleProgress {
  words: number;
  goal: number;
  /** 0 (nothing written) to 1 (goal reached). */
  ratio: number;
  percent: number;
  remaining: number;
  /** Wax left, 1 = full candle; never below the stub. */
  wax: number;
  state: 'unlit' | 'burning' | 'spent';
}

export const CANDLE_STUB = 0.08;

export function candleProgress(words: number, goal: number): CandleProgress {
  const g = clampGoal(goal);
  const w = Math.max(0, Math.floor(words));
  const ratio = Math.min(1, w / g);
  return {
    words: w, goal: g, ratio,
    percent: Math.floor(ratio * 100),
    remaining: Math.max(0, g - w),
    wax: CANDLE_STUB + (1 - CANDLE_STUB) * (1 - ratio),
    state: w === 0 ? 'unlit' : w >= g ? 'spent' : 'burning',
  };
}

/** FNV-1a, enough to tell whether the notes changed since the outline was structured. */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const isReviewStale = (review: GhostReview, blocks: Block[]): boolean =>
  blocks.find((b) => b.id === review.blockId)?.text !== review.sourceText;

/** A finding whose quote is no longer in the paragraph cannot be pointed at. */
export const quoteStillPresent = (f: GhostFinding, blocks: Block[], blockId: string): boolean =>
  !!blocks.find((b) => b.id === blockId)?.text.includes(f.quote);

// ---------- output validators (used by the server after each Kiro run) ----------

type Ok<T> = { ok: true; value: T; dropped: string[] };
type Bad = { ok: false; error: string };
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);

/** `{ sections: [{ heading, brief, evidence: [{ claim, keys? }] }] }` → OutlineItem[]. Keys not in `knownKeys` are removed and the claim stays "needed". */
export function validateOutline(raw: unknown, knownKeys: string[], newId: () => string): Ok<OutlineItem[]> | Bad {
  if (!obj(raw) || !Array.isArray(raw.sections)) return { ok: false, error: 'Kiro did not return an outline with a "sections" list.' };
  if (!raw.sections.length) return { ok: false, error: 'Kiro returned an empty outline. Add more detail to the notes and try again.' };
  const known = new Map(knownKeys.map((k) => [k.replace(/^@/, '').toLowerCase(), k.replace(/^@/, '')] as const));
  const dropped: string[] = [];
  const items: OutlineItem[] = [];
  for (const s of raw.sections.slice(0, LIMITS.outlineItems)) {
    const heading = obj(s) ? str(s.heading, LIMITS.headingChars) : null;
    const brief = obj(s) ? str(s.brief, LIMITS.briefChars) : null;
    if (!obj(s) || !heading || !brief) { dropped.push('a section without a usable heading and brief'); continue; }
    const evidence: EvidenceNeed[] = [];
    for (const e of Array.isArray(s.evidence) ? s.evidence.slice(0, LIMITS.evidencePerItem) : []) {
      const claim = obj(e) ? str(e.claim, LIMITS.claimChars) : null;
      if (!claim) continue;
      const keys = (obj(e) && Array.isArray(e.keys) ? e.keys : []).filter((k): k is string => typeof k === 'string');
      const real = [...new Set(keys.map((k) => known.get(k.replace(/^@/, '').toLowerCase())).filter((k): k is string => !!k))];
      if (real.length < new Set(keys.map((k) => k.replace(/^@/, '').toLowerCase())).size) dropped.push(`unknown citation keys in "${heading}"`);
      evidence.push({ id: newId(), claim, status: real.length ? 'cited' : 'needed', ...(real.length ? { keys: real } : {}) });
    }
    items.push({ id: newId(), heading, brief, evidence, origin: 'kiro' });
  }
  if (raw.sections.length > LIMITS.outlineItems) dropped.push(`${raw.sections.length - LIMITS.outlineItems} sections beyond the limit of ${LIMITS.outlineItems}`);
  return items.length ? { ok: true, value: items, dropped } : { ok: false, error: 'None of the outline sections Kiro returned were usable.' };
}

export interface DraftValue { paragraph: string; evidenceNeeded: string[] }

/** `{ paragraph, evidenceNeeded }`. One paragraph only; any `[@key]` must be a known key (no invented sources). */
export function validateDraft(raw: unknown, knownKeys: string[]): Ok<DraftValue> | Bad {
  if (!obj(raw)) return { ok: false, error: 'Kiro did not return a draft object.' };
  const paragraph = str(raw.paragraph, LIMITS.draftChars);
  if (!paragraph) return { ok: false, error: 'The draft paragraph was missing or longer than 2,500 characters.' };
  if (/\n[ \t]*\n/.test(paragraph)) return { ok: false, error: 'Kiro returned more than one paragraph; a draft must be one paragraph.' };
  const known = new Set(knownKeys.map((k) => k.toLowerCase()));
  const unknown = extractCitations(paragraph).flatMap((t) => t.keys).filter((k) => !known.has(k.toLowerCase()));
  if (unknown.length) return { ok: false, error: `The draft cites keys that are not in your notes or references: ${[...new Set(unknown)].join(', ')}.` };
  const evidenceNeeded = (Array.isArray(raw.evidenceNeeded) ? raw.evidenceNeeded : [])
    .map((e) => str(e, LIMITS.claimChars)).filter((e): e is string => !!e).slice(0, LIMITS.draftEvidence);
  return { ok: true, value: { paragraph, evidenceNeeded }, dropped: [] };
}

/** `{ findings: [{ category, quote, critique, advice }] }`. Findings whose quote is not an exact substring of `paragraph` are dropped and counted. */
export function validateReview(raw: unknown, paragraph: string, newId: () => string): Ok<GhostFinding[]> | Bad {
  if (!obj(raw) || !Array.isArray(raw.findings)) return { ok: false, error: 'Kiro did not return a review with a "findings" list.' };
  const dropped: string[] = [];
  const out: GhostFinding[] = [];
  for (const f of raw.findings) {
    if (out.length >= LIMITS.findings) { dropped.push('a concern beyond the limit of 5'); continue; }
    if (!obj(f)) { dropped.push('a malformed concern'); continue; }
    const category = GHOST_CATEGORIES.find((c) => c === f.category);
    const quote = typeof f.quote === 'string' && f.quote.length >= LIMITS.quoteMin && f.quote.length <= LIMITS.quoteChars ? f.quote : null;
    const critique = str(f.critique, LIMITS.critiqueChars);
    const advice = str(f.advice, LIMITS.adviceChars);
    if (!category || !critique || !advice) { dropped.push('a concern with a missing category, critique or advice'); continue; }
    if (!quote || !paragraph.includes(quote)) { dropped.push('a concern whose quote is not in the paragraph'); continue; }
    out.push({ id: newId(), category, quote, critique, advice, state: 'open' });
  }
  return { ok: true, value: out, dropped };
}
