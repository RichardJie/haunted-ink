import { describe, expect, it } from 'vitest';
import { exportName, orderedReferences, toBibtex, toCitationReport, toCslJson, toMarkdown } from '../../src/lib/export.ts';
import { splitIntoBlocks } from '../../src/lib/manuscript.ts';
import { DISCLAIMER, type Reference, type Verification } from '../../shared/types.ts';

const refs: Reference[] = [
  { id: 'a', key: 'a2015', doi: '10.1000/a', title: 'Alpha', authors: ['Lee, Ann'], year: 2015, raw: 'A', source: 'doi' },
  { id: 'b', key: 'b2016', title: 'Beta', raw: 'B', source: 'line' },
];
const blocks = splitIntoBlocks('# My Paper\n\nSee [@b2016] then [@a2015].');
const ver: Record<string, Verification> = {
  a: { status: 'verified', provider: 'doi.org', agency: 'Crossref', checkedAt: '2026-11-06T00:00:00.000Z', registered: { title: 'Alpha (registered)', authors: ['Lee, Ann'], year: 2015 } },
};

describe('export', () => {
  it('orders references by first citation', () => expect(orderedReferences(blocks, refs).map((r) => r.id)).toEqual(['b', 'a']));
  it('appends a References section with DOI links', () => {
    const md = toMarkdown(blocks, refs);
    expect(md).toContain('## References');
    expect(md.indexOf('Beta')).toBeLessThan(md.indexOf('Alpha'));
    expect(md).toContain('https://doi.org/10.1000/a');
  });
  it('writes BibTeX and CSL-JSON, preferring registered metadata only for verified entries', () => {
    expect(toBibtex(refs)).toContain('@misc{a2015,');
    const csl = JSON.parse(toCslJson(refs, ver));
    expect(csl[0]).toMatchObject({ id: 'a2015', title: 'Alpha (registered)', DOI: '10.1000/a' });
    expect(csl[1].title).toBe('Beta');
    expect(csl[0].status).toBeUndefined();
  });
  it('reports every status with the disclaimer', () => {
    const r = toCitationReport(refs, ver, 'My Paper');
    expect(r).toContain(DISCLAIMER);
    expect(r).toContain('Status: Verified');
    expect(r).toContain('Status: No DOI');
    expect(r).toContain('Crossref');
  });
  it('names files from the title and date', () => {
    expect(exportName(blocks, 'md', '', new Date(2026, 10, 6))).toBe('my-paper-2026-11-06.md');
  });
});
