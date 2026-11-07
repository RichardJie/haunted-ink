import { describe, expect, it } from 'vitest';
import { checkPlaceholders, flagNewFacts, protect, restore } from '../../shared/protect.ts';

const text = 'Gates help [@hochreiter1997] (see https://doi.org/10.1162/neco.1997.9.8.1735) and gave 12.5% gains in 1997.';

describe('protect / restore', () => {
  it('REGRESSION: a DOI ending in a matched parenthesis stays whole; an outer closing bracket does not', () => {
    const input = 'Membranes were modelled (doi:10.1016/S0006-3495(76)85000-1) and (see 10.1016/0022-2836(81)90087-5).';
    const p = protect(input);
    expect(p.tokens).toContain('10.1016/S0006-3495(76)85000-1');
    expect(p.tokens).toContain('10.1016/0022-2836(81)90087-5');
    expect(p.text).toBe('Membranes were modelled (doi:⟦C1⟧) and (see ⟦C2⟧).');
    expect(restore(p.text, p)).toBe(input);
  });
  it('replaces citations, URLs, DOIs and numbers in order and round-trips', () => {
    const p = protect(text);
    expect(p.tokens).toEqual(['[@hochreiter1997]', 'https://doi.org/10.1162/neco.1997.9.8.1735', '12.5%', '1997']);
    expect(p.text).toBe('Gates help ⟦C1⟧ (see ⟦C2⟧) and gave ⟦C3⟧ gains in ⟦C4⟧.');
    expect(restore(p.text, p)).toBe(text);
  });
  it('protects a bare DOI', () => {
    expect(protect('as in 10.1038/nature14539.').tokens).toEqual(['10.1038/nature14539']);
  });
});

describe('checkPlaceholders', () => {
  const ph = ['⟦C1⟧', '⟦C2⟧'];
  it('accepts reordered placeholders used once', () => expect(checkPlaceholders('b ⟦C2⟧ a ⟦C1⟧', ph).ok).toBe(true));
  it('rejects a missing placeholder', () => expect(checkPlaceholders('only ⟦C1⟧', ph).ok).toBe(false));
  it('rejects a duplicated placeholder', () => expect(checkPlaceholders('⟦C1⟧ ⟦C1⟧ ⟦C2⟧', ph).ok).toBe(false));
  it('rejects an invented placeholder', () => expect(checkPlaceholders('⟦C1⟧ ⟦C2⟧ ⟦C9⟧', ph).ok).toBe(false));
});

describe('flagNewFacts', () => {
  it('flags new numbers, years, DOIs, URLs and author-year citations', () => {
    const flags = flagNewFacts('Gates help [@a] in 1997.', 'Gates help [@a] in 1997, by 40% (Smith 2024), see https://x.org/p and 10.1000/new.');
    const kinds = flags.map((f) => `${f.kind}:${f.value}`);
    expect(kinds).toContain('number:40%');
    expect(kinds).toContain('year:2024');
    expect(kinds).toContain('url:https://x.org/p');
    expect(kinds).toContain('doi:10.1000/new');
    expect(kinds.some((k) => k.startsWith('citation:') && k.includes('Smith 2024'))).toBe(true);
    expect(kinds).not.toContain('year:1997');
  });
  it('flags nothing when nothing is new', () => {
    expect(flagNewFacts('See [@a], 3 times in 1997.', 'In 1997, 3 times, see [@a].')).toEqual([]);
  });
  describe('REGRESSION: URL or DOI whose suffix ends in a matched ")"', () => {
    const cases: [string, string, string[]][] = [
      ['Use https://doi.org/10.1234/alpha(beta).', 'Use ⟦C1⟧.', ['https://doi.org/10.1234/alpha(beta)']],
      ['(see https://doi.org/10.1234/alpha(beta)).', '(see ⟦C1⟧).', ['https://doi.org/10.1234/alpha(beta)']],
      ['as in 10.1234/alpha(beta).', 'as in ⟦C1⟧.', ['10.1234/alpha(beta)']],
    ];
    for (const [input, text, tokens] of cases) {
      it(input, () => {
        const p = protect(input);
        expect(p.tokens).toEqual(tokens);
        expect(p.text).toBe(text);
        expect(restore(p.text, p)).toBe(input);
      });
    }
    it('the unwrapped sentence leaves no stray ")" and fact extraction uses the same boundary', () => {
      expect(protect('Use https://doi.org/10.1234/alpha(beta).').text).not.toContain(')');
      expect(flagNewFacts('Use https://doi.org/10.1234/alpha(beta).', 'Apply https://doi.org/10.1234/alpha(beta).').filter((f) => f.kind === 'url')).toEqual([]);
    });
  });
});
