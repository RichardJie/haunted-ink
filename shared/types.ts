export type Status =
  | 'unchecked' | 'checking' | 'verified' | 'mismatch'
  | 'not_found' | 'uncertain' | 'invalid_doi' | 'no_doi';

export interface Reference {
  id: string;
  key?: string;
  number?: number;
  doi?: string;
  title?: string;
  authors?: string[];
  year?: number;
  raw: string;
  note?: string;
  source: 'doi' | 'bibtex' | 'line' | 'example';
}

export interface FieldCheck {
  field: 'title' | 'year' | 'firstAuthor';
  claimed: string;
  registered: string;
  match: boolean;
}

export interface Registered {
  title?: string;
  authors?: string[];
  year?: number;
  container?: string;
  url?: string;
}

export interface Verification {
  status: Status;
  reason?: string;
  provider?: 'doi.org';
  agency?: string;
  checkedAt?: string;
  registered?: Registered;
  fields?: FieldCheck[];
}

export interface Block {
  id: string;
  text: string;
}

export interface AppliedRevision {
  id: string;
  blockId: string;
  before: string;
  after: string;
  intent: string;
  appliedAt: string;
  undone?: boolean;
}

/** Schema 2 (before the ghost editorial room). Still read so saved work survives the upgrade. */
export interface SavedV2 {
  schema: 2;
  title?: string;
  blocks: Block[];
  references: Reference[];
  verifications: Record<string, Verification>;
  history: AppliedRevision[];
}

// ---------- Ghost editorial room: notes, outline, drafts, ghost reviews ----------

/** A claim an outline section or draft makes that still needs a source. `cited` only when the user or the notes name a key. */
export interface EvidenceNeed {
  id: string;
  claim: string;
  status: 'needed' | 'cited';
  /** Citation keys from the notes or the ledger, never invented. */
  keys?: string[];
}

/** One section of the structured outline; drafting turns one item into one paragraph. */
export interface OutlineItem {
  id: string;
  heading: string;
  /** What the paragraph should argue, in the author's or Kiro's words. */
  brief: string;
  evidence: EvidenceNeed[];
  /** Block the most recent inserted draft for this item became (stable block id). */
  blockId?: string;
  origin: 'kiro' | 'author';
}

export type GhostCategory = 'logic' | 'evidence' | 'clarity';

export interface GhostFinding {
  id: string;
  category: GhostCategory;
  /** Exact substring of the reviewed paragraph text. */
  quote: string;
  critique: string;
  advice: string;
  state: 'open' | 'resolved' | 'dismissed';
}

/** One real Kiro review of one paragraph. Zero findings is a valid, honest result. */
export interface GhostReview {
  id: string;
  blockId: string;
  /** The exact paragraph text Kiro read. The review is stale when the block text differs. */
  sourceText: string;
  reviewedAt: string;
  findings: GhostFinding[];
  /** How many of Kiro's concerns were discarded because their quote was not in the paragraph (or was malformed). */
  dropped?: number;
}

export interface Saved {
  schema: 3;
  title?: string;
  blocks: Block[];
  references: Reference[];
  verifications: Record<string, Verification>;
  history: AppliedRevision[];
  notes: string;
  outline: OutlineItem[];
  /** Hash of the notes text the outline was last structured from (see shared/editorial.ts `textHash`). */
  outlineFromNotes?: string;
  /** Latest review per block id. */
  reviews: Record<string, GhostReview>;
  wordGoal: number;
}

export interface VerifyEntry {
  id: string;
  doi: string;
  title?: string;
  year?: number;
  firstAuthor?: string;
}

export interface RevisionResult {
  revised: string;
  changes: string[];
  declined: string[];
  flagged: { kind: string; value: string }[];
}

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';

export type JobKind = 'revision' | 'structure' | 'draft' | 'review';

export interface StructureResult { items: OutlineItem[]; dropped: string[] }
export interface DraftResult {
  paragraph: string;
  /** Claims the author still has to source, including numbers and years Kiro introduced that are not in the notes. */
  evidenceNeeded: string[];
  flagged: { kind: string; value: string }[];
}
export interface ReviewResult { blockId: string; sourceText: string; findings: GhostFinding[]; dropped: string[]; returned: number }

export interface JobView<R = RevisionResult> {
  id: string;
  state: JobState;
  position?: number;
  elapsedMs: number;
  result?: R;
  error?: { code: string; message: string; fix?: string };
}

export const DISCLAIMER =
  'Verified means the identifier exists and its registered metadata matches this entry. It does not mean the source supports the sentence that cites it.';
