import { clampGoal, DEFAULT_WORD_GOAL, EVIDENCE_MARK, evidenceMark } from '../shared/editorial.ts';
import type { AppliedRevision, Block, GhostFinding, GhostReview, JobView, OutlineItem, Reference, Saved, Verification } from '../shared/types.ts';
import { splitIntoBlocks } from './lib/manuscript.ts';
import { uid } from './lib/uid.ts';

export interface RevisionUI {
  blockId: string;
  baseText: string;
  intent: string;
  jobId?: string;
  phase: 'compose' | 'submitting' | 'active' | 'done' | 'failed';
  job?: JobView;
  error?: { message: string; fix?: string };
  startedAt?: number;
}

/** Transient UI state of one real Kiro task (structure, draft or review). Never persisted, never pre-filled. */
export interface KiroTask {
  phase: 'submitting' | 'queued' | 'running' | 'failed';
  jobId?: string;
  position?: number;
  elapsedMs?: number;
  error?: { message: string; fix?: string };
}

/** A drafted paragraph waiting for the author to insert or discard it. */
export interface DraftPreviewState {
  itemId: string;
  phase: KiroTask['phase'] | 'ready';
  task?: KiroTask;
  paragraph?: string;
  evidenceNeeded?: string[];
  flagged?: { kind: string; value: string }[];
  /** What the request was made against; the draft is out of date when the section or notes differ from it. */
  snapshot?: DraftSnapshot;
}

export interface DraftSnapshot { heading: string; brief: string; evidence: string; notes: string }

export const draftSnapshot = (item: OutlineItem, notes: string): DraftSnapshot => ({
  heading: item.heading, brief: item.brief, notes,
  evidence: JSON.stringify(item.evidence.map((e) => [e.claim, e.status, e.keys ?? []])),
});

/** True when the section's heading, brief or evidence, or the notes, changed after the draft was requested. */
export const isDraftStale = (d: DraftPreviewState, item: OutlineItem | undefined, notes: string): boolean =>
  !!d.snapshot && (!item || JSON.stringify(d.snapshot) !== JSON.stringify(draftSnapshot(item, notes)));

export interface State {
  title?: string;
  blocks: Block[];
  references: Reference[];
  verifications: Record<string, Verification>;
  history: AppliedRevision[];
  notice?: string;
  revision: RevisionUI | null;
  referenceMessages: string[];
  notes: string;
  outline: OutlineItem[];
  outlineFromNotes?: string;
  reviews: Record<string, GhostReview>;
  wordGoal: number;
}

export type Action =
  | { type: 'edit_block'; id: string; text: string }
  | { type: 'add_block'; afterId?: string; id?: string }
  | { type: 'delete_block'; id: string }
  | { type: 'replace_manuscript'; blocks: Block[]; references?: Reference[]; title?: string }
  | { type: 'add_references'; added: Reference[]; messages: string[] }
  | { type: 'update_reference'; id: string; patch: Partial<Reference> }
  | { type: 'delete_reference'; id: string }
  | { type: 'mark_checking'; ids: string[] }
  | { type: 'set_verifications'; results: Record<string, Verification>; fingerprints: Record<string, string> }
  | { type: 'open_revision'; blockId: string }
  | { type: 'revision'; patch: Partial<RevisionUI> }
  | { type: 'close_revision' }
  | { type: 'applied'; entry: AppliedRevision }
  | { type: 'undone'; id: string; blockId: string; before: string }
  | { type: 'dismiss_notice' }
  | { type: 'set_notes'; text: string }
  | { type: 'outline_set'; items: OutlineItem[]; fromNotes?: string }
  | { type: 'outline_add'; afterId?: string; id?: string }
  | { type: 'outline_update'; id: string; patch: Partial<Pick<OutlineItem, 'heading' | 'brief'>> }
  | { type: 'outline_delete'; id: string }
  | { type: 'outline_move'; id: string; dir: -1 | 1 }
  | { type: 'evidence_add'; itemId: string; claim: string; id?: string }
  | { type: 'evidence_remove'; itemId: string; evidenceId: string }
  | { type: 'insert_draft'; itemId: string; text: string; evidenceNeeded?: string[]; id?: string }
  | { type: 'set_review'; review: GhostReview }
  | { type: 'finding_state'; blockId: string; findingId: string; state: GhostFinding['state'] }
  | { type: 'set_word_goal'; goal: number };

export const emptyState = (): State => ({
  blocks: [], references: [], verifications: {}, history: [], revision: null, referenceMessages: [],
  notes: '', outline: [], reviews: {}, wordGoal: DEFAULT_WORD_GOAL,
});

export function fromSaved(saved: Saved | null, notice?: string): State {
  if (!saved) return { ...emptyState(), notice };
  return {
    ...emptyState(), title: saved.title, blocks: saved.blocks, references: saved.references, verifications: saved.verifications, history: saved.history, notice,
    notes: saved.notes, outline: saved.outline, outlineFromNotes: saved.outlineFromNotes, reviews: saved.reviews, wordGoal: saved.wordGoal,
  };
}

export function toSaved(s: State): Saved {
  return {
    schema: 3, title: s.title, blocks: s.blocks, references: s.references, verifications: s.verifications, history: s.history.slice(-20),
    notes: s.notes, outline: s.outline, outlineFromNotes: s.outlineFromNotes, reviews: s.reviews, wordGoal: s.wordGoal,
  };
}

/** Where a drafted paragraph goes: after this item's earlier draft, else after the nearest earlier item's draft, else at the end. */
export function draftInsertIndex(s: Pick<State, 'blocks' | 'outline'>, itemId: string): number {
  const at = s.outline.findIndex((o) => o.id === itemId);
  for (let i = at; i >= 0; i--) {
    const bid = s.outline[i].blockId;
    const bi = bid ? s.blocks.findIndex((b) => b.id === bid) : -1;
    if (bi >= 0) return bi + 1;
  }
  return s.blocks.length;
}

function moved<T>(a: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || j < 0 || j >= a.length) return a;
  const out = [...a];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

const mapItem = (s: State, id: string, f: (o: OutlineItem) => OutlineItem): State => ({ ...s, outline: s.outline.map((o) => (o.id === id ? f(o) : o)) });
const withoutKey = <T,>(r: Record<string, T>, k: string): Record<string, T> => { const c = { ...r }; delete c[k]; return c; };

export const fingerprint = (r: Reference): string => [r.doi ?? '', r.title ?? '', r.year ?? '', r.authors?.[0] ?? ''].join('|');

export type ApplyResult = { ok: true; entry: AppliedRevision } | { ok: false; reason: 'missing' | 'stale' };

/** Anchored by stable block id and by the exact text the request was made against. */
export function prepareApply(s: State, rev: RevisionUI, after: string): ApplyResult {
  const block = s.blocks.find((b) => b.id === rev.blockId);
  if (!block) return { ok: false, reason: 'missing' };
  if (block.text !== rev.baseText) return { ok: false, reason: 'stale' };
  return { ok: true, entry: { id: uid('rev'), blockId: block.id, before: block.text, after, intent: rev.intent, appliedAt: new Date().toISOString() } };
}

export type UndoCheck = 'ok' | 'missing' | 'edited' | 'already';

export function checkUndo(s: State, id: string): UndoCheck {
  const h = s.history.find((x) => x.id === id);
  if (!h || h.undone) return 'already';
  const b = s.blocks.find((x) => x.id === h.blockId);
  if (!b) return 'missing';
  return b.text === h.after ? 'ok' : 'edited';
}

function withBlockText(blocks: Block[], id: string, text: string): Block[] {
  if (/\n[ \t]*\n/.test(text)) {
    const parts = splitIntoBlocks(text);
    if (!parts.length) return blocks;
    return blocks.flatMap((b) => (b.id === id ? [{ id, text: parts[0].text }, ...parts.slice(1)] : [b]));
  }
  return blocks.map((b) => (b.id === id ? { ...b, text } : b));
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'edit_block':
      return { ...s, blocks: withBlockText(s.blocks, a.id, a.text) };
    case 'add_block': {
      const nb: Block = { id: a.id ?? uid('b'), text: '' };
      const i = a.afterId ? s.blocks.findIndex((b) => b.id === a.afterId) : s.blocks.length - 1;
      const blocks = [...s.blocks];
      blocks.splice(i + 1, 0, nb);
      return { ...s, blocks };
    }
    case 'delete_block':
      return { ...s, blocks: s.blocks.filter((b) => b.id !== a.id), revision: s.revision?.blockId === a.id ? null : s.revision, reviews: withoutKey(s.reviews, a.id) };
    case 'replace_manuscript':
      return {
        ...s, title: a.title, blocks: a.blocks, references: a.references ?? s.references, verifications: a.references ? {} : s.verifications, history: [], revision: null, notice: undefined,
        reviews: {}, outline: s.outline.map(({ blockId: _b, ...o }) => o),
      };
    case 'add_references':
      return { ...s, references: [...s.references, ...a.added], referenceMessages: a.messages };
    case 'update_reference': {
      const old = s.references.find((r) => r.id === a.id);
      if (!old) return s;
      const next = { ...old, ...a.patch };
      const changed = fingerprint(old) !== fingerprint(next);
      const verifications = { ...s.verifications };
      if (changed) delete verifications[a.id];
      return { ...s, references: s.references.map((r) => (r.id === a.id ? next : r)), verifications };
    }
    case 'delete_reference': {
      const verifications = { ...s.verifications };
      delete verifications[a.id];
      return { ...s, references: s.references.filter((r) => r.id !== a.id), verifications };
    }
    case 'mark_checking':
      return { ...s, verifications: { ...s.verifications, ...Object.fromEntries(a.ids.map((id) => [id, { status: 'checking' as const }])) } };
    case 'set_verifications': {
      const verifications = { ...s.verifications };
      for (const [id, v] of Object.entries(a.results)) {
        const ref = s.references.find((r) => r.id === id);
        if (!ref || fingerprint(ref) !== a.fingerprints[id]) continue; // edited or deleted while checking
        verifications[id] = v;
      }
      for (const id of Object.keys(verifications)) {
        if (verifications[id].status === 'checking' && id in a.fingerprints && !(id in a.results)) delete verifications[id];
      }
      return { ...s, verifications };
    }
    case 'open_revision':
      return { ...s, revision: { blockId: a.blockId, baseText: s.blocks.find((b) => b.id === a.blockId)?.text ?? '', intent: '', phase: 'compose' } };
    case 'revision':
      return s.revision ? { ...s, revision: { ...s.revision, ...a.patch } } : s;
    case 'close_revision':
      return { ...s, revision: null };
    case 'applied':
      return {
        ...s,
        blocks: s.blocks.map((b) => (b.id === a.entry.blockId ? { ...b, text: a.entry.after } : b)),
        history: [...s.history, a.entry].slice(-20),
        revision: null,
      };
    case 'undone':
      return {
        ...s,
        blocks: s.blocks.map((b) => (b.id === a.blockId ? { ...b, text: a.before } : b)),
        history: s.history.map((h) => (h.id === a.id ? { ...h, undone: true } : h)),
      };
    case 'dismiss_notice':
      return { ...s, notice: undefined };
    case 'set_notes':
      return { ...s, notes: a.text };
    case 'outline_set':
      return { ...s, outline: a.items, outlineFromNotes: a.fromNotes ?? s.outlineFromNotes };
    case 'outline_add': {
      const item: OutlineItem = { id: a.id ?? uid('o'), heading: '', brief: '', evidence: [], origin: 'author' };
      const i = a.afterId ? s.outline.findIndex((o) => o.id === a.afterId) : s.outline.length - 1;
      const outline = [...s.outline];
      outline.splice(i + 1, 0, item);
      return { ...s, outline };
    }
    case 'outline_update':
      return mapItem(s, a.id, (o) => ({ ...o, ...a.patch }));
    case 'outline_delete':
      return { ...s, outline: s.outline.filter((o) => o.id !== a.id) };
    case 'outline_move':
      return { ...s, outline: moved(s.outline, s.outline.findIndex((o) => o.id === a.id), a.dir) };
    case 'evidence_add':
      return a.claim.trim() ? mapItem(s, a.itemId, (o) => ({ ...o, evidence: [...o.evidence, { id: a.id ?? uid('e'), claim: a.claim.trim(), status: 'needed' }] })) : s;
    case 'evidence_remove':
      return mapItem(s, a.itemId, (o) => ({ ...o, evidence: o.evidence.filter((e) => e.id !== a.evidenceId) }));
    case 'insert_draft': {
      if (!s.outline.some((o) => o.id === a.itemId) || !a.text.trim()) return s;
      // A claim is skipped only when an actual inline [evidence needed: ...] marker already says the same
      // thing (equal after case, spacing and punctuation normalisation), or an earlier entry in this batch did.
      // Plain prose never counts, and similar-but-different wording (numbers, negation) is kept.
      const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const seen = new Set([...a.text.matchAll(EVIDENCE_MARK)].map((m) => norm(m[0].replace(/^\[evidence needed:/i, ''))));
      const missing = (a.evidenceNeeded ?? []).filter((c) => {
        const k = norm(c);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      }).map(evidenceMark);
      const block: Block = { id: a.id ?? uid('b'), text: [a.text.trim(), ...missing].join(' ') };
      const blocks = [...s.blocks];
      blocks.splice(draftInsertIndex(s, a.itemId), 0, block);
      return { ...mapItem(s, a.itemId, (o) => ({ ...o, blockId: block.id })), blocks };
    }
    case 'set_review':
      return s.blocks.some((b) => b.id === a.review.blockId) ? { ...s, reviews: { ...s.reviews, [a.review.blockId]: a.review } } : s;
    case 'finding_state': {
      const r = s.reviews[a.blockId];
      if (!r) return s;
      return { ...s, reviews: { ...s.reviews, [a.blockId]: { ...r, findings: r.findings.map((f) => (f.id === a.findingId ? { ...f, state: a.state } : f)) } } };
    }
    case 'set_word_goal':
      return { ...s, wordGoal: clampGoal(a.goal) };
  }
}
