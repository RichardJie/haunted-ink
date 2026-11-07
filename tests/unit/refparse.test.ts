import { describe, expect, it } from 'vitest';
import { parseReferences, MAX_REFERENCES } from '../../src/lib/refparse.ts';
import type { Reference } from '../../shared/types.ts';

describe('parseReferences', () => {
  it('reads a DOI list with mixed prefixes', () => {
    const r = parseReferences('10.1038/nature14539\ndoi:10.1109/CVPR.2016.90\nhttps://doi.org/10.48550/arXiv.1706.03762', []);
    expect(r.added.map((x) => x.doi)).toEqual(['10.1038/nature14539', '10.1109/CVPR.2016.90', '10.48550/arXiv.1706.03762']);
    expect(r.added.every((x) => x.source === 'doi')).toBe(true);
  });
  it('reads BibTeX fields', () => {
    const r = parseReferences('@article{k1, title={T}, author={A, B and C, D}, year={1999}, doi={10.1000/x1}}', []);
    expect(r.added[0]).toMatchObject({ key: 'k1', title: 'T', authors: ['A, B', 'C, D'], year: 1999, doi: '10.1000/x1', source: 'bibtex' });
  });
  it('reads bibliography lines, extracting a DOI and year when present', () => {
    const r = parseReferences('Hochreiter S. “Long Short-Term Memory”. Neural Computation 1997. doi:10.1162/neco.1997.9.8.1735.\nGoodfellow I. Deep Learning. MIT Press, 2016.', []);
    expect(r.added[0]).toMatchObject({ doi: '10.1162/neco.1997.9.8.1735', year: 1997, title: 'Long Short-Term Memory' });
    expect(r.added[1].doi).toBeUndefined();
  });
  it('refuses duplicate DOIs, naming the existing entry', () => {
    const existing: Reference[] = [{ id: 'a', key: 'lecun2015', doi: '10.1038/NATURE14539', raw: '', source: 'doi' }];
    const r = parseReferences('https://doi.org/10.1038/nature14539', existing);
    expect(r.added).toEqual([]);
    expect(r.messages[0]).toContain('lecun2015');
  });
  it('limits the ledger to 100 references', () => {
    const existing: Reference[] = Array.from({ length: MAX_REFERENCES }, (_, i) => ({ id: `r${i}`, doi: `10.1000/x${i}`, raw: '', source: 'doi' as const }));
    const r = parseReferences('10.1000/new', existing);
    expect(r.added).toEqual([]);
    expect(r.messages[0]).toContain('100');
  });
  it('asks for input when empty', () => expect(parseReferences('  ', []).messages).toHaveLength(1));
});
