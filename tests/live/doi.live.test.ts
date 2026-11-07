import { describe, expect, it } from 'vitest';
import { createDoiClient } from '../../server/doi.ts';
import { EXAMPLE_REFERENCES } from '../../src/example/references.ts';

// Real doi.org and registration-agency calls. No mocks.
const reachable = await fetch('https://doi.org/api/handles/10.1038/nature14539', { signal: AbortSignal.timeout(10000) }).then((r) => r.ok, () => false);
if (!reachable) console.warn('SKIPPED: doi.org is not reachable from this machine.');

describe.skipIf(!reachable)('live doi.org', () => {
  const client = createDoiClient();
  const entries = EXAMPLE_REFERENCES.map((r) => ({
    id: r.key!, doi: r.doi ?? '', title: r.title, year: r.year, firstAuthor: r.authors?.[0],
  })).filter((e) => e.doi);

  it('gives each built-in example reference its expected status', async () => {
    const res = await client.verify(entries);
    expect(res.lecun2015).toMatchObject({ status: 'verified', agency: 'Crossref', provider: 'doi.org' });
    expect(res.he2016).toMatchObject({ status: 'verified', agency: 'Crossref' });
    expect(res.vaswani2017).toMatchObject({ status: 'verified', agency: 'DataCite' });
    expect(res.hochreiter1997.status).toBe('mismatch');
    expect(res.hochreiter1997.fields?.find((f) => f.field === 'year')).toMatchObject({ claimed: '1998', match: false });
    expect(res.phantom2026.status).toBe('not_found');
    for (const v of Object.values(res)) expect(v.checkedAt).toBeTruthy();
  });

  it('REGRESSION (live): same DOI, correct title then wrong title, gives verified then mismatch', async () => {
    const doi = '10.1038/nature14539';
    const fresh = createDoiClient();
    const a = await fresh.verify([{ id: 'a', doi, title: 'Deep learning' }]);
    const b = await fresh.verify([{ id: 'b', doi, title: 'A Totally Different Title' }]);
    expect(a.a.status).toBe('verified');
    expect(b.b.status).toBe('mismatch');
  });

  it('a DOI containing parentheses resolves or is cleanly not found, never throws', async () => {
    const r = await client.verify([{ id: 'p', doi: '10.1016/S0006-3495(76)85000-1' }]);
    expect(['verified', 'not_found', 'uncertain']).toContain(r.p.status);
  });
});
