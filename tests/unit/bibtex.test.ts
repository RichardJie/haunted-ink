import { describe, expect, it } from 'vitest';
import { parseBibtex, splitAuthors } from '../../src/lib/bibtex.ts';

describe('parseBibtex', () => {
  it('reads braces, quotes, numbers and nested braces', () => {
    const e = parseBibtex(`@article{lecun2015,
      title = {{Deep} learning},
      author = "LeCun, Yann and Bengio, Yoshua",
      year = 2015,
      doi = {10.1038/nature14539}
    }
    @inproceedings{he2016, title={Deep {R}esidual Learning}, year={2016}}`);
    expect(e).toHaveLength(2);
    expect(e[0].key).toBe('lecun2015');
    expect(e[0].fields).toMatchObject({ year: '2015', doi: '10.1038/nature14539' });
    expect(e[0].fields.title).toBe('{Deep} learning');
    expect(e[1].fields.title).toBe('Deep {R}esidual Learning');
  });
  it('removes LaTeX accents and braces from authors', () => {
    expect(splitAuthors("Schmidhuber, J{\\\"u}rgen and Garc{\\'i}a, Ana")).toEqual(['Schmidhuber, Jürgen', 'García, Ana']);
  });
  it('returns nothing for broken input without throwing', () => {
    expect(parseBibtex('@article{broken')).toEqual([]);
  });
});
