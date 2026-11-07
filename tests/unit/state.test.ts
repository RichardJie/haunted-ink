import { describe, expect, it } from 'vitest';
import { checkUndo, emptyState, fingerprint, prepareApply, reducer, type State } from '../../src/state.ts';
import type { Reference } from '../../shared/types.ts';

const base = (): State => ({ ...emptyState(), blocks: [{ id: 'b1', text: 'Same text.' }, { id: 'b2', text: 'Same text.' }] });

function openAndApply(s: State, blockId: string, after: string) {
  s = reducer(s, { type: 'open_revision', blockId });
  const rev = s.revision!;
  const res = prepareApply(s, { ...rev, intent: 'tighten' }, after);
  return { s, res };
}

describe('apply and undo (stable block ids)', () => {
  it('applies to the right one of two identical paragraphs and undoes it', () => {
    const { s, res } = openAndApply(base(), 'b2', 'Better text.');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    let t = reducer(s, { type: 'applied', entry: res.entry });
    expect(t.blocks.map((b) => b.text)).toEqual(['Same text.', 'Better text.']);
    expect(checkUndo(t, res.entry.id)).toBe('ok');
    t = reducer(t, { type: 'undone', id: res.entry.id, blockId: 'b2', before: res.entry.before });
    expect(t.blocks.map((b) => b.text)).toEqual(['Same text.', 'Same text.']);
    expect(checkUndo(t, res.entry.id)).toBe('already');
  });
  it('blocks apply when the paragraph was edited while the request was pending', () => {
    let s = reducer(base(), { type: 'open_revision', blockId: 'b1' });
    const rev = s.revision!;
    s = reducer(s, { type: 'edit_block', id: 'b1', text: 'Same text, edited.' });
    expect(prepareApply(s, rev, 'x')).toEqual({ ok: false, reason: 'stale' });
  });
  it('blocks apply when the paragraph was deleted', () => {
    let s = reducer(base(), { type: 'open_revision', blockId: 'b1' });
    const rev = s.revision!;
    s = reducer({ ...s, revision: null }, { type: 'delete_block', id: 'b1' });
    expect(prepareApply(s, rev, 'x')).toEqual({ ok: false, reason: 'missing' });
  });
  it('undo survives edits elsewhere and unrelated reordering, and flags an edited paragraph', () => {
    const { s, res } = openAndApply(base(), 'b1', 'After.');
    if (!res.ok) throw new Error('apply');
    let t = reducer(s, { type: 'applied', entry: res.entry });
    t = reducer(t, { type: 'edit_block', id: 'b2', text: 'Other edit.' });
    t = reducer(t, { type: 'add_block', afterId: 'b1' });
    expect(checkUndo(t, res.entry.id)).toBe('ok');
    t = reducer(t, { type: 'edit_block', id: 'b1', text: 'After, hand edited.' });
    expect(checkUndo(t, res.entry.id)).toBe('edited');
    t = reducer(t, { type: 'delete_block', id: 'b1' });
    expect(checkUndo(t, res.entry.id)).toBe('missing');
  });
  it('keeps at most 20 history entries', () => {
    let s = base();
    for (let i = 0; i < 22; i++) {
      s = reducer(s, { type: 'applied', entry: { id: `h${i}`, blockId: 'b1', before: 'a', after: 'b', intent: '', appliedAt: '' } });
    }
    expect(s.history).toHaveLength(20);
    expect(s.history[0].id).toBe('h2');
  });
  it('splitting a paragraph on a blank line keeps the original id on the first part', () => {
    const s = reducer(base(), { type: 'edit_block', id: 'b1', text: 'One.\n\nTwo.' });
    expect(s.blocks.map((b) => b.text)).toEqual(['One.', 'Two.', 'Same text.']);
    expect(s.blocks[0].id).toBe('b1');
  });
});

describe('references and verification', () => {
  const ref: Reference = { id: 'r1', doi: '10.1000/x', title: 'T', raw: '', source: 'doi' };
  const withRef = (): State => ({ ...base(), references: [ref], verifications: { r1: { status: 'verified' } } });
  it('editing DOI, title, author or year resets the status to unchecked; a note does not', () => {
    expect(reducer(withRef(), { type: 'update_reference', id: 'r1', patch: { title: 'T2' } }).verifications.r1).toBeUndefined();
    expect(reducer(withRef(), { type: 'update_reference', id: 'r1', patch: { note: 'n' } }).verifications.r1.status).toBe('verified');
  });
  it('ignores a check result for an entry edited while checking', () => {
    let s = reducer(withRef(), { type: 'mark_checking', ids: ['r1'] });
    const fp = fingerprint(s.references[0]);
    s = reducer(s, { type: 'update_reference', id: 'r1', patch: { title: 'Changed' } });
    s = reducer(s, { type: 'set_verifications', results: { r1: { status: 'verified' } }, fingerprints: { r1: fp } });
    expect(s.verifications.r1).toBeUndefined();
  });
  it('applies a result when the entry is unchanged', () => {
    let s = reducer(withRef(), { type: 'mark_checking', ids: ['r1'] });
    s = reducer(s, { type: 'set_verifications', results: { r1: { status: 'mismatch' } }, fingerprints: { r1: fingerprint(ref) } });
    expect(s.verifications.r1.status).toBe('mismatch');
  });
});

describe('ghost editorial state', () => {
  const withOutline = (): State => reducer(reducer(reducer(base(), { type: 'outline_add', id: 'o1' }), { type: 'outline_add', id: 'o2' }), { type: 'outline_update', id: 'o1', patch: { heading: 'Gates', brief: 'Why gates help.' } });

  it('edits, reorders and removes outline sections and their evidence', () => {
    let s = withOutline();
    expect(s.outline.map((o) => [o.id, o.origin])).toEqual([['o1', 'author'], ['o2', 'author']]);
    s = reducer(s, { type: 'outline_move', id: 'o2', dir: -1 });
    expect(s.outline.map((o) => o.id)).toEqual(['o2', 'o1']);
    s = reducer(s, { type: 'outline_move', id: 'o2', dir: -1 });
    expect(s.outline.map((o) => o.id)).toEqual(['o2', 'o1']);
    s = reducer(s, { type: 'evidence_add', itemId: 'o1', claim: '  Vanishing gradients  ', id: 'e1' });
    s = reducer(s, { type: 'evidence_add', itemId: 'o1', claim: '   ' });
    expect(s.outline[1].evidence).toEqual([{ id: 'e1', claim: 'Vanishing gradients', status: 'needed' }]);
    s = reducer(s, { type: 'evidence_remove', itemId: 'o1', evidenceId: 'e1' });
    expect(s.outline[1].evidence).toEqual([]);
    s = reducer(s, { type: 'outline_delete', id: 'o2' });
    expect(s.outline.map((o) => o.id)).toEqual(['o1']);
  });

  it('REGRESSION: a claim Kiro already marked inline is not marked a second time', () => {
    const s = reducer(withOutline(), {
      type: 'insert_draft', itemId: 'o1', id: 'd9',
      text: 'It is the organising claim [evidence needed: Gated recurrence, residual shortcuts and attention are three answers to one problem].',
      evidenceNeeded: ['gated recurrence, residual shortcuts and attention are three answers to one problem.'],
    });
    expect(s.blocks.at(-1)!.text.match(/evidence needed/gi)).toHaveLength(1);
  });

  describe('insert_draft evidence markers', () => {
    const insert = (text: string, evidenceNeeded: string[]) =>
      reducer(withOutline(), { type: 'insert_draft', itemId: 'o1', id: 'dx', text, evidenceNeeded }).blocks.at(-1)!.text;
    const marks = (t: string) => t.match(/\[evidence needed:[^\]]*\]/gi) ?? [];

    it('REGRESSION: a claim that appears verbatim in plain prose still gets a marker', () => {
      const t = insert('Our method improves accuracy.', ['Our method improves accuracy.']);
      expect(marks(t)).toEqual(['[evidence needed: Our method improves accuracy.]']);
    });

    it('does not duplicate an inline marker that differs only in case, spacing or punctuation', () => {
      const t = insert('Gates help [evidence needed: Gates  HELP, a lot].', ['gates help a lot']);
      expect(marks(t)).toHaveLength(1);
    });

    it('keeps distinct claims that share most words (number or negation differs)', () => {
      const t = insert('Prose [evidence needed: The model improves accuracy by 5 percent on the test set].', [
        'The model improves accuracy by 7 percent on the test set',
        'The model does not improve accuracy by 5 percent on the test set',
      ]);
      expect(marks(t)).toHaveLength(3);
    });

    it('adds one marker for repeated equivalent entries', () => {
      const t = insert('Plain.', ['Gates keep signals alive.', 'gates keep signals alive', ' Gates  keep signals alive! ']);
      expect(marks(t)).toEqual(['[evidence needed: Gates keep signals alive.]']);
    });
  });

  it('inserts a draft as a new block, keeps existing text, and marks unmet evidence', () => {
    let s = withOutline();
    s = reducer(s, { type: 'insert_draft', itemId: 'o1', text: 'Gates keep a signal alive.', evidenceNeeded: ['vanishing gradients'], id: 'd1' });
    expect(s.blocks.map((b) => b.text)).toEqual(['Same text.', 'Same text.', 'Gates keep a signal alive. [evidence needed: vanishing gradients]']);
    expect(s.outline[0].blockId).toBe('d1');
    // Drafting the next section goes after the earlier draft, not at the end.
    s = reducer(s, { type: 'edit_block', id: 'b1', text: 'Same text.' });
    s = reducer(s, { type: 'add_block', id: 'tail' });
    s = reducer(s, { type: 'insert_draft', itemId: 'o2', text: 'Second section.', id: 'd2' });
    expect(s.blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'd1', 'd2', 'tail']);
    // Unknown item or empty text changes nothing.
    expect(reducer(s, { type: 'insert_draft', itemId: 'nope', text: 'x' })).toBe(s);
    expect(reducer(s, { type: 'insert_draft', itemId: 'o1', text: '  ' })).toBe(s);
  });

  it('stores one review per block, tracks finding state, and drops reviews with their block', () => {
    let s = base();
    const review = { id: 'r1', blockId: 'b1', sourceText: 'Same text.', reviewedAt: 't', findings: [{ id: 'f1', category: 'logic' as const, quote: 'Same', critique: 'c', advice: 'a', state: 'open' as const }] };
    s = reducer(s, { type: 'set_review', review });
    s = reducer(s, { type: 'finding_state', blockId: 'b1', findingId: 'f1', state: 'resolved' });
    expect(s.reviews.b1.findings[0].state).toBe('resolved');
    expect(reducer(s, { type: 'set_review', review: { ...review, blockId: 'gone' } })).toBe(s);
    s = reducer(s, { type: 'delete_block', id: 'b1' });
    expect(s.reviews).toEqual({});
  });

  it('keeps notes and outline but clears reviews and draft links when the manuscript is replaced', () => {
    let s = reducer(withOutline(), { type: 'set_notes', text: 'my notes' });
    s = reducer(s, { type: 'insert_draft', itemId: 'o1', text: 'Draft.', id: 'd1' });
    s = reducer(s, { type: 'set_review', review: { id: 'r', blockId: 'd1', sourceText: 'Draft.', reviewedAt: 't', findings: [] } });
    s = reducer(s, { type: 'replace_manuscript', blocks: [{ id: 'n1', text: 'New.' }] });
    expect(s.notes).toBe('my notes');
    expect(s.outline).toHaveLength(2);
    expect(s.outline[0].blockId).toBeUndefined();
    expect(s.reviews).toEqual({});
  });

  it('clamps the word goal', () => {
    expect(reducer(base(), { type: 'set_word_goal', goal: 10 }).wordGoal).toBe(50);
  });
});
