import { describe, expect, it } from 'vitest';
import { extractCitations, linkToken } from '../../shared/citations.ts';
import type { Reference } from '../../shared/types.ts';

const refs: Reference[] = [
  { id: 'a', key: 'lecun2015', raw: '', source: 'doi' },
  { id: 'b', key: 'he2016', raw: '', source: 'doi' },
  { id: 'c', raw: '', source: 'line' },
];

describe('extractCitations', () => {
  it('reads pandoc, LaTeX and numeric forms', () => {
    const t = extractCitations('A [@lecun2015; @he2016] B \\citep{x,y} C [1] D [2-4] E [1, 3] F [link](http://x) G [12](u)');
    expect(t.map((x) => x.raw)).toEqual(['[@lecun2015; @he2016]', '\\citep{x,y}', '[1]', '[2-4]', '[1, 3]']);
    expect(t[0].keys).toEqual(['lecun2015', 'he2016']);
    expect(t[1].keys).toEqual(['x', 'y']);
    expect(t[3].numbers).toEqual([2, 3, 4]);
    expect(t[4].numbers).toEqual([1, 3]);
  });
});

describe('linkToken', () => {
  it('links by key and number, and reports unlinked citations', () => {
    const [k, n, u] = extractCitations('[@he2016] [3] [@ghost]');
    expect(linkToken(k, refs).linked.map((r) => r.id)).toEqual(['b']);
    expect(linkToken(n, refs).linked.map((r) => r.id)).toEqual(['c']);
    expect(linkToken(u, refs).unlinked).toEqual(['ghost']);
  });
});
