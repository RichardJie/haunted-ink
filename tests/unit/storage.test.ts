import { describe, expect, it } from 'vitest';
import { CORRUPT_BACKUP_KEY, LEGACY_KEY_V2, loadSaved, migrateV2, STORAGE_KEY, writeSaved } from '../../src/storage.ts';
import type { Saved, SavedV2 } from '../../shared/types.ts';

const mem = (entries: Record<string, string> = {}) => {
  const data = { ...entries };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
};
const v2: SavedV2 = {
  schema: 2, blocks: [{ id: 'b1', text: 'x' }], references: [{ id: 'r1', raw: 'r', source: 'doi' }],
  verifications: { r1: { status: 'checking' } }, history: [{ id: 'h1', blockId: 'b1', before: 'a', after: 'x', intent: 'Tighten', appliedAt: 't' }],
};
const good: Saved = { ...migrateV2(v2), notes: 'n', wordGoal: 900 };

describe('loadSaved', () => {
  it('treats empty storage as a normal fresh start with no notice', () => {
    expect(loadSaved(mem())).toEqual({ saved: null });
  });
  it('restores valid schema 3 data and resets in-flight checks', () => {
    const r = loadSaved(mem({ [STORAGE_KEY]: JSON.stringify(good) }));
    expect(r.notice).toBeUndefined();
    expect(r.saved?.blocks[0].text).toBe('x');
    expect(r.saved?.notes).toBe('n');
    expect(r.saved?.wordGoal).toBe(900);
    expect(r.saved?.verifications.r1.status).toBe('unchecked');
  });
  it('migrates schema 2 work without losing manuscript, references or history, and leaves the v2 copy untouched', () => {
    const store = mem({ [LEGACY_KEY_V2]: JSON.stringify(v2) });
    const r = loadSaved(store);
    expect(r.migratedFrom).toBe(2);
    expect(r.notice).toBeUndefined();
    expect(r.saved).toMatchObject({ schema: 3, blocks: v2.blocks, references: v2.references, history: v2.history, notes: '', outline: [], reviews: {}, wordGoal: 1500 });
    expect(store.data[LEGACY_KEY_V2]).toBe(JSON.stringify(v2));
  });
  it('prefers schema 3 over an old v2 copy', () => {
    const r = loadSaved(mem({ [STORAGE_KEY]: JSON.stringify(good), [LEGACY_KEY_V2]: JSON.stringify({ ...v2, blocks: [] }) }));
    expect(r.saved?.blocks).toHaveLength(1);
  });
  it('explains corrupt data and unknown schema versions, and backs the raw data up first', () => {
    const store = mem({ [STORAGE_KEY]: '{nope' });
    expect(loadSaved(store).notice).toMatch(/could not be restored/);
    expect(store.data[CORRUPT_BACKUP_KEY]).toBe('{nope');
    expect(loadSaved(mem({ [STORAGE_KEY]: JSON.stringify({ ...good, schema: 99 }) })).notice).toMatch(/could not be restored/);
    expect(loadSaved(mem({ [STORAGE_KEY]: JSON.stringify({ ...good, outline: [{ id: 1 }] }) })).notice).toBeDefined();
    expect(loadSaved(mem({ [LEGACY_KEY_V2]: JSON.stringify({ ...v2, blocks: 'x' }) })).notice).toBeDefined();
  });
  it('rejects reviews with an unknown category or state', () => {
    const bad = { ...good, reviews: { b1: { id: 'r', blockId: 'b1', sourceText: 'x', reviewedAt: 't', findings: [{ id: 'f', category: 'vibes', quote: 'x', critique: 'c', advice: 'a', state: 'open' }] } } };
    expect(loadSaved(mem({ [STORAGE_KEY]: JSON.stringify(bad) })).notice).toBeDefined();
  });
  it('does not crash when storage throws', () => {
    expect(loadSaved({ getItem: () => { throw new Error('blocked'); } }).notice).toMatch(/blocked/);
  });
  it('keeps only the last 20 history entries and round-trips through writeSaved', () => {
    const history = Array.from({ length: 25 }, (_, i) => ({ id: `h${i}`, blockId: 'b1', before: 'a', after: 'b', intent: 'i', appliedAt: 't' }));
    const store = mem();
    writeSaved(store, { ...good, history });
    expect(loadSaved(store).saved?.history).toHaveLength(20);
  });
});
