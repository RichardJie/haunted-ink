// What each kind of Kiro job asks and how its answer is checked. Pure of process control:
// `run` is the isolated runner, so these functions are tested with fixture replies in tests only.
import { randomUUID } from 'node:crypto';
import { extractCitations } from '../../shared/citations.ts';
import { LIMITS, validateDraft, validateOutline, validateReview } from '../../shared/editorial.ts';
import { checkPlaceholders, flagNewFacts, protect, restore, type Protected } from '../../shared/protect.ts';
import type { DraftResult, ReviewResult, RevisionResult, StructureResult } from '../../shared/types.ts';
import { buildEditorPrompt, buildPrompt, parseJsonReply, parseReviserOutput } from './protocol.ts';
import { KiroError } from './runner.ts';

export type RunFn = (prompt: string, signal: AbortSignal) => Promise<string>;

export interface RevisionRequest { paragraph: string; heading?: string; intent: string }
export interface StructureRequest { notes: string; knownKeys: string[] }
export interface DraftRequest {
  item: { heading: string; brief: string; evidence: { claim: string; status: 'needed' | 'cited'; keys: string[] }[] };
  notes: string;
  knownKeys: string[];
  before: string;
  after: string;
}
export interface ReviewRequest { blockId: string; paragraph: string; heading?: string }

export type JobRequest =
  | ({ kind?: 'revision' } & RevisionRequest)
  | ({ kind: 'structure' } & StructureRequest)
  | ({ kind: 'draft' } & DraftRequest)
  | ({ kind: 'review' } & ReviewRequest);

export type JobResult = RevisionResult | StructureResult | DraftResult | ReviewResult;

const newId = () => `k-${randomUUID().slice(0, 8)}`;
const FIX_RETRY = 'Run it again. Nothing in your notes, outline or manuscript was changed.';
const bad = (problem: string) => new KiroError('bad_output', problem, FIX_RETRY);

function reply(finalText: string): unknown {
  const p = parseJsonReply(finalText);
  if (!p.ok) throw bad(p.problem);
  return p.value;
}

/** Keys the author supplied: ledger keys plus `[@key]` keys written in the notes. Not proof that a source exists. */
export function suppliedKeys(knownKeys: string[], notes: string): string[] {
  const seen = new Map<string, string>();
  for (const k of [...knownKeys, ...extractCitations(notes).flatMap((t) => t.keys)]) {
    const key = k.replace(/^@/, '');
    if (key && !seen.has(key.toLowerCase())) seen.set(key.toLowerCase(), key);
  }
  return [...seen.values()];
}

export async function revision(req: RevisionRequest, run: RunFn, signal: AbortSignal): Promise<RevisionResult> {
  const prot = protect(req.paragraph);
  const finalText = await run(buildPrompt({ intent: req.intent, heading: req.heading, protectedText: prot }), signal);
  throwIfAborted(signal);
  const parsed = parseReviserOutput(finalText);
  if (!parsed.ok) throw new KiroError('bad_output', parsed.problem, 'Run the revision again, or shorten the paragraph.');
  const ph = checkPlaceholders(parsed.value.revised, prot.placeholders);
  if (!ph.ok) throw new KiroError('bad_output', ph.problem, 'Run the revision again. Nothing was changed.');
  const revised = restore(parsed.value.revised, prot);
  return { revised, changes: parsed.value.changes, declined: parsed.value.declined, flagged: flagNewFacts(req.paragraph, revised) };
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new KiroError(signal.reason === 'timed_out' ? 'timed_out' : 'cancelled', 'stopped');
}

export async function structure(req: StructureRequest, run: RunFn, signal: AbortSignal): Promise<StructureResult> {
  const keys = suppliedKeys(req.knownKeys, req.notes);
  const finalText = await run(buildEditorPrompt({ task: 'structure', notes: req.notes, knownKeys: keys }), signal);
  throwIfAborted(signal);
  const v = validateOutline(reply(finalText), keys, newId);
  if (!v.ok) throw bad(v.error);
  return { items: v.value, dropped: v.dropped };
}

export async function draft(req: DraftRequest, run: RunFn, signal: AbortSignal): Promise<DraftResult> {
  const keys = suppliedKeys(req.knownKeys, req.notes);
  const prompt = buildEditorPrompt({
    task: 'draft', heading: req.item.heading, brief: req.item.brief, evidence: req.item.evidence,
    notes: req.notes, knownKeys: keys, before: req.before, after: req.after,
  });
  const finalText = await run(prompt, signal);
  throwIfAborted(signal);
  const v = validateDraft(reply(finalText), keys);
  if (!v.ok) throw bad(v.error);
  // Anything the author did not supply is surfaced, not trusted.
  const source = [req.notes, req.item.heading, req.item.brief, req.before, req.after, ...req.item.evidence.map((e) => e.claim)].join('\n');
  const flagged = flagNewFacts(source, v.value.paragraph).filter((f) => f.kind !== 'citation');
  const invented = flagged.filter((f) => f.kind === 'doi' || f.kind === 'url');
  if (invented.length) throw bad(`The draft contains ${invented.map((f) => `${f.kind.toUpperCase()} ${f.value}`).join(', ')}, which is not in your notes. Haunted Ink never accepts an identifier Kiro made up.`);
  const introduced = flagged.map((f) => `the ${f.kind} “${f.value}” is not in your notes or brief`);
  return { paragraph: v.value.paragraph, evidenceNeeded: [...v.value.evidenceNeeded, ...introduced].slice(0, LIMITS.draftEvidence + 6), flagged };
}

const PH = /⟦[^⟧]*⟧/g;

/**
 * Review replies may quote any subset of the protected tokens, several findings may share a token.
 * Known placeholders are restored, invented ones drop that finding, and each quote must then be an exact substring of the original paragraph.
 */
export function checkReview(raw: unknown, paragraph: string, prot: Protected): { findings: ReviewResult['findings']; dropped: string[]; returned: number } | { error: string } {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { findings?: unknown }).findings)) return { error: 'Kiro did not return a review with a "findings" list.' };
  const returned = (raw as { findings: unknown[] }).findings;
  const dropped: string[] = [];
  const kept: unknown[] = [];
  const fields = ['quote', 'critique', 'advice'] as const;
  for (const f of returned) {
    if (typeof f !== 'object' || f === null) { kept.push(f); continue; }
    const rec = { ...(f as Record<string, unknown>) };
    let invented = false;
    for (const k of fields) {
      const v = rec[k];
      if (typeof v !== 'string') continue;
      if ((v.match(PH) ?? []).some((p) => !prot.placeholders.includes(p) && !paragraph.includes(p))) invented = true;
      rec[k] = restore(v, prot);
    }
    if (invented) dropped.push('a concern that used a token that is not in the paragraph'); else kept.push(rec);
  }
  const v = validateReview({ findings: kept }, paragraph, newId);
  if (!v.ok) return { error: v.error };
  return { findings: v.value, dropped: [...dropped, ...v.dropped], returned: returned.length };
}

export async function review(req: ReviewRequest, run: RunFn, signal: AbortSignal): Promise<ReviewResult> {
  const prot = protect(req.paragraph);
  const finalText = await run(buildEditorPrompt({ task: 'review', heading: req.heading ?? '', paragraph: prot.text, placeholders: prot.placeholders }), signal);
  throwIfAborted(signal);
  const out = checkReview(reply(finalText), req.paragraph, prot);
  if ('error' in out) throw bad(out.error);
  return { blockId: req.blockId, sourceText: req.paragraph, ...out };
}
