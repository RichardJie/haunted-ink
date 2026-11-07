import type { Reference } from '../../shared/types.ts';

/**
 * Entries for the built-in example. Metadata was retrieved from doi.org on 2026-11-06 (see SOURCES.md).
 * Statuses are NOT stored here: loading the example leaves every reference unchecked, and only a real
 * network check produces a result. The comments below say what a check is expected to show.
 */
export const EXAMPLE_REFERENCES: Reference[] = [
  {
    id: 'ex-lecun2015', key: 'lecun2015', source: 'example',
    doi: '10.1038/nature14539', title: 'Deep learning', authors: ['LeCun, Yann', 'Bengio, Yoshua', 'Hinton, Geoffrey'], year: 2015,
    raw: 'LeCun, Bengio, Hinton. Deep learning. Nature, 2015.',
    note: 'Expected: Verified (Crossref).',
  },
  {
    id: 'ex-he2016', key: 'he2016', source: 'example',
    doi: '10.1109/CVPR.2016.90', title: 'Deep Residual Learning for Image Recognition', authors: ['He, Kaiming', 'Zhang, Xiangyu', 'Ren, Shaoqing', 'Sun, Jian'], year: 2016,
    raw: 'He, Zhang, Ren, Sun. Deep Residual Learning for Image Recognition. CVPR, 2016.',
    note: 'Expected: Verified (Crossref).',
  },
  {
    id: 'ex-vaswani2017', key: 'vaswani2017', source: 'example',
    doi: '10.48550/arXiv.1706.03762', title: 'Attention Is All You Need', authors: ['Vaswani, Ashish', 'Shazeer, Noam', 'Parmar, Niki'], year: 2017,
    raw: 'Vaswani et al. Attention Is All You Need. arXiv, 2017.',
    note: 'Expected: Verified (DataCite).',
  },
  {
    id: 'ex-hochreiter1997', key: 'hochreiter1997', source: 'example',
    doi: '10.1162/neco.1997.9.8.1735', title: 'Long Short-Term Memory', authors: ['Hochreiter, Sepp', 'Schmidhuber, Jürgen'], year: 1998,
    raw: 'Hochreiter, Schmidhuber. Long Short-Term Memory. Neural Computation, 1998.',
    note: 'INTENTIONAL PROBLEM: the year is entered as 1998 on purpose. doi.org records 1997, so a check should show Mismatch.',
  },
  {
    id: 'ex-goodfellow2016', key: 'goodfellow2016', source: 'example',
    title: 'Deep Learning', authors: ['Goodfellow, Ian', 'Bengio, Yoshua', 'Courville, Aaron'], year: 2016,
    raw: 'Goodfellow, Bengio, Courville. Deep Learning. MIT Press, 2016.',
    note: 'INTENTIONAL: this entry has no DOI, so it shows No DOI.',
  },
  {
    id: 'ex-phantom2026', key: 'phantom2026', source: 'example',
    doi: '10.1145/haunted-ink.unresolved.2026', title: 'On the Persistence of Phantom Citations', authors: ['Nobody, A.'], year: 2026,
    raw: 'Nobody, A. On the Persistence of Phantom Citations. 2026. (fictional)',
    note: 'INTENTIONAL PROBLEM: this work and its DOI are fictional. A check should show Not found.',
  },
];
