import { clampGoal, DEFAULT_WORD_GOAL } from '../shared/editorial.ts';
import type { GhostReview, OutlineItem, Saved, SavedV2 } from '../shared/types.ts';

/** Current key (schema 3). */
export const STORAGE_KEY = 'haunted-ink:v3';
/** Schema 2 key. It is read once to migrate and never written or deleted, so it stays as a backup. */
export const LEGACY_KEY_V2 = 'haunted-ink:v2';
/** Raw text of unreadable saved data is copied here before the app saves over it. */
export const CORRUPT_BACKUP_KEY = 'haunted-ink:unreadable-backup';

export type LoadResult = { saved: Saved | null; notice?: string; migratedFrom?: 2 };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validV2Core(s: Record<string, unknown>): boolean {
  return (
    Array.isArray(s.blocks) && s.blocks.every((b) => typeof b?.id === 'string' && typeof b?.text === 'string') &&
    Array.isArray(s.references) && s.references.every((r) => typeof r?.id === 'string' && typeof r?.raw === 'string') &&
    isObj(s.verifications) &&
    Array.isArray(s.history) && s.history.every((h) => typeof h?.id === 'string' && typeof h?.blockId === 'string' && typeof h?.before === 'string' && typeof h?.after === 'string')
  );
}

const validItem = (o: unknown): o is OutlineItem =>
  isObj(o) && typeof o.id === 'string' && typeof o.heading === 'string' && typeof o.brief === 'string' && Array.isArray(o.evidence) &&
  o.evidence.every((e) => isObj(e) && typeof e.id === 'string' && typeof e.claim === 'string' && (e.status === 'needed' || e.status === 'cited'));

const validReview = (o: unknown): o is GhostReview =>
  isObj(o) && typeof o.id === 'string' && typeof o.blockId === 'string' && typeof o.sourceText === 'string' && Array.isArray(o.findings) &&
  o.findings.every((f) => isObj(f) && typeof f.id === 'string' && typeof f.quote === 'string' && typeof f.critique === 'string' && typeof f.advice === 'string' &&
    ['logic', 'evidence', 'clarity'].includes(f.category as string) && ['open', 'resolved', 'dismissed'].includes(f.state as string));

function validV3(v: unknown): v is Saved {
  if (!isObj(v) || v.schema !== 3 || !validV2Core(v)) return false;
  return typeof v.notes === 'string' && Array.isArray(v.outline) && v.outline.every(validItem) &&
    isObj(v.reviews) && Object.values(v.reviews).every(validReview) && typeof v.wordGoal === 'number';
}

/** Schema 2 → 3: everything is kept; the new parts start empty. */
export function migrateV2(s: SavedV2): Saved {
  return { ...s, schema: 3, notes: '', outline: [], reviews: {}, wordGoal: DEFAULT_WORD_GOAL };
}

function finish(saved: Saved): Saved {
  // A "checking" status cannot survive a reload.
  const verifications = Object.fromEntries(Object.entries(saved.verifications).map(([k, v]) => [k, v.status === 'checking' ? { status: 'unchecked' as const } : v]));
  return { ...saved, verifications, history: saved.history.slice(-20), wordGoal: clampGoal(saved.wordGoal) };
}

type Store = Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'setItem'>>;
const NOTICE = 'Saved work could not be restored (it was damaged or from another version), so the room starts empty. A copy of the unreadable data was kept in this browser.';

/** A missing key is a normal fresh start. Schema 2 data is migrated. Corrupt or unknown data starts empty with a notice and is backed up first. */
export function loadSaved(storage: Store): LoadResult {
  let raw: string | null;
  let legacy: string | null;
  try { raw = storage.getItem(STORAGE_KEY); legacy = raw === null ? storage.getItem(LEGACY_KEY_V2) : null; } catch {
    return { saved: null, notice: 'Saved work could not be read because browser storage is blocked. Starting empty.' };
  }
  const source = raw ?? legacy;
  if (source === null) return { saved: null };
  try {
    const parsed: unknown = JSON.parse(source);
    if (raw !== null && validV3(parsed)) return { saved: finish(parsed) };
    if (raw === null && isObj(parsed) && parsed.schema === 2 && validV2Core(parsed)) return { saved: finish(migrateV2(parsed as unknown as SavedV2)), migratedFrom: 2 };
  } catch { /* fall through */ }
  try { storage.setItem?.(CORRUPT_BACKUP_KEY, source); } catch { /* best effort */ }
  return { saved: null, notice: NOTICE };
}

export function writeSaved(storage: Pick<Storage, 'setItem'>, saved: Saved): boolean {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(saved)); return true; } catch { return false; }
}
