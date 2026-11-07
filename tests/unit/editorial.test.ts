import { describe, expect, it } from 'vitest';
import {
  bodyWords, candleProgress, clampGoal, countWords, isReviewStale, quoteStillPresent, textHash, validateDraft, validateOutline, validateReview,
} from '../../shared/editorial.ts';
import type { GhostReview } from '../../shared/types.ts';

let n = 0;
const id = () => `id${++n}`;

describe('word count', () => {
  it('counts prose words, not citations, evidence markers or punctuation', () => {
    expect(countWords('One two [@lecun2015] three \\cite{a,b} four [1, 3] five.')).toBe(5);
    expect(countWords('A claim [evidence needed: a source for this] stands.')).toBe(3);
    expect(countWords(' — ; ')).toBe(0);
    expect(countWords('长短期记忆 network')).toBe(2);
  });
  it('excludes headings from the body count', () => {
    expect(bodyWords([{ id: 'a', text: '# Title words here' }, { id: 'b', text: 'Body has four words.' }])).toBe(4);
  });
});

describe('candle progress', () => {
  it('is unlit and full with no words', () => {
    expect(candleProgress(0, 1500)).toMatchObject({ state: 'unlit', ratio: 0, wax: 1, remaining: 1500, percent: 0 });
  });
  it('shortens in proportion to words written', () => {
    const p = candleProgress(375, 1500);
    expect(p.state).toBe('burning');
    expect(p.percent).toBe(25);
    expect(p.wax).toBeCloseTo(0.08 + 0.92 * 0.75);
    expect(candleProgress(750, 1500).wax).toBeLessThan(p.wax);
  });
  it('stops at the stub when the goal is reached or passed', () => {
    expect(candleProgress(1500, 1500)).toMatchObject({ state: 'spent', ratio: 1, remaining: 0 });
    expect(candleProgress(9000, 1500).wax).toBeCloseTo(0.08);
  });
  it('clamps goals to sensible bounds', () => {
    expect(clampGoal(3)).toBe(50);
    expect(clampGoal(1e9)).toBe(200000);
    expect(clampGoal(Number.NaN)).toBe(1500);
    expect(candleProgress(10, 0).goal).toBe(50);
  });
});

describe('review staleness', () => {
  const review: GhostReview = { id: 'r', blockId: 'b1', sourceText: 'Gates help a lot.', reviewedAt: 't', findings: [{ id: 'f', category: 'logic', quote: 'a lot', critique: 'c', advice: 'a', state: 'open' }] };
  it('is fresh while the text is unchanged and stale after an edit or deletion', () => {
    expect(isReviewStale(review, [{ id: 'b1', text: 'Gates help a lot.' }])).toBe(false);
    expect(isReviewStale(review, [{ id: 'b1', text: 'Gates help.' }])).toBe(true);
    expect(isReviewStale(review, [])).toBe(true);
  });
  it('knows when a quote is gone', () => {
    expect(quoteStillPresent(review.findings[0], [{ id: 'b1', text: 'Gates help.' }], 'b1')).toBe(false);
  });
  it('hashes notes deterministically', () => {
    expect(textHash('abc')).toBe(textHash('abc'));
    expect(textHash('abc')).not.toBe(textHash('abd'));
  });
});

describe('validateOutline', () => {
  it('keeps known keys as cited and marks the rest as needed', () => {
    const r = validateOutline({ sections: [{ heading: 'Gates', brief: 'Gated recurrence keeps signals.', evidence: [{ claim: 'LSTM gates', keys: ['@hochreiter1997'] }, { claim: 'Quadratic cost', keys: ['made_up2020'] }] }] }, ['hochreiter1997'], id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0].evidence.map((e) => [e.status, e.keys])).toEqual([['cited', ['hochreiter1997']], ['needed', undefined]]);
    expect(r.value[0].origin).toBe('kiro');
    expect(r.dropped.join()).toMatch(/unknown citation keys/);
  });
  it('rejects malformed or empty output', () => {
    expect(validateOutline({ outline: [] }, [], id).ok).toBe(false);
    expect(validateOutline({ sections: [] }, [], id).ok).toBe(false);
    expect(validateOutline({ sections: [{ heading: '', brief: 'x' }] }, [], id).ok).toBe(false);
  });
});

describe('validateDraft', () => {
  it('accepts one paragraph citing known keys', () => {
    const r = validateDraft({ paragraph: 'Gates help [@hochreiter1997]. [evidence needed: cost]', evidenceNeeded: ['cost'] }, ['hochreiter1997']);
    expect(r.ok && r.value.evidenceNeeded).toEqual(['cost']);
  });
  it('rejects invented citation keys and multiple paragraphs', () => {
    expect(validateDraft({ paragraph: 'See [@ghost2026].' }, ['he2016'])).toMatchObject({ ok: false, error: expect.stringMatching(/ghost2026/) });
    expect(validateDraft({ paragraph: 'One.\n\nTwo.' }, []).ok).toBe(false);
    expect(validateDraft({ paragraph: 'x'.repeat(2501) }, []).ok).toBe(false);
  });
});

describe('validateReview', () => {
  const para = 'Attention replaces the carried state with direct access, and it is always cheaper.';
  it('keeps findings whose quote is an exact substring and drops the rest', () => {
    const r = validateReview({ findings: [
      { category: 'evidence', quote: 'it is always cheaper', critique: 'No source for the cost claim.', advice: 'Cite a measurement or soften it.' },
      { category: 'logic', quote: 'not in the paragraph', critique: 'c', advice: 'a' },
      { category: 'vibes', quote: 'Attention', critique: 'c', advice: 'a' },
    ] }, para, id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(1);
    expect(r.value[0]).toMatchObject({ category: 'evidence', state: 'open' });
    expect(r.dropped).toHaveLength(2);
  });
  it('allows an honest zero-finding review', () => {
    expect(validateReview({ findings: [] }, para, id)).toEqual({ ok: true, value: [], dropped: [] });
  });
  it('caps at five concerns', () => {
    const many = Array.from({ length: 7 }, () => ({ category: 'clarity', quote: 'Attention', critique: 'c', advice: 'a' }));
    const r = validateReview({ findings: many }, para, id);
    expect(r.ok && r.value.length).toBe(5);
  });
});
