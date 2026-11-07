import { describe, expect, it } from 'vitest';
import { compareEntry, dice, titleMatches, type Csl } from '../../shared/match.ts';

// Fields recorded in src/example/SOURCES.md (retrieved from doi.org on 2026-11-06).
const lstm: Csl = {
  title: 'Long Short-Term Memory',
  author: [{ family: 'Hochreiter', given: 'Sepp' }, { family: 'Schmidhuber', given: 'Jürgen' }],
  issued: { 'date-parts': [[1997, 11, 1]] },
  'published-print': { 'date-parts': [[1997, 11, 1]] },
};
const nature: Csl = {
  title: 'Deep learning',
  author: [{ family: 'LeCun', given: 'Yann' }],
  issued: { 'date-parts': [[2015, 5, 27]] },
  'published-print': { 'date-parts': [[2015, 5, 28]] },
};

describe('compareEntry', () => {
  it('matches when title, year and first author agree', () => {
    const f = compareEntry({ title: 'Long short-term memory', year: 1997, firstAuthor: 'Hochreiter, Sepp' }, lstm);
    expect(f.every((x) => x.match)).toBe(true);
  });
  it('reports the year that disagrees (intentional example)', () => {
    const f = compareEntry({ title: 'Long Short-Term Memory', year: 1998 }, lstm);
    expect(f.find((x) => x.field === 'year')).toMatchObject({ match: false, registered: '1997' });
  });
  it('checks only provided fields', () => expect(compareEntry({}, lstm)).toEqual([]));
  it('accepts either issued or print year', () => expect(compareEntry({ year: 2015 }, nature)[0].match).toBe(true));
  it('compares "Given Family" author strings', () => expect(compareEntry({ firstAuthor: 'Yann LeCun' }, nature)[0].match).toBe(true));
  it('folds diacritics and punctuation in titles', () => {
    expect(titleMatches('Deep  Learning!', 'deep learning')).toBe(true);
    expect(titleMatches('A different paper', 'Deep learning')).toBe(false);
  });
  it('uses token Dice for near matches', () => expect(dice('a b c d e f g h i j', 'a b c d e f g h i k')).toBeGreaterThanOrEqual(0.9));
});
