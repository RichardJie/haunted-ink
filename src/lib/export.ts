import { extractCitations, linkToken } from '../../shared/citations.ts';
import { normalizeDoi } from '../../shared/doi.ts';
import { familyName } from '../../shared/match.ts';
import { DISCLAIMER, type Block, type Reference, type Verification } from '../../shared/types.ts';
import { blocksToText, slug, titleOf } from './manuscript.ts';

/** References ordered by first citation; uncited ones follow in ledger order. */
export function orderedReferences(blocks: Block[], refs: Reference[]): Reference[] {
  const seen: Reference[] = [];
  for (const t of extractCitations(blocksToText(blocks))) {
    for (const r of linkToken(t, refs).linked) if (!seen.includes(r)) seen.push(r);
  }
  return [...seen, ...refs.filter((r) => !seen.includes(r))];
}

export function formatReference(r: Reference): string {
  const authors = r.authors?.length ? (r.authors.length > 3 ? `${r.authors[0]} et al.` : r.authors.join('; ')) : '';
  const parts = [authors, r.year ? `(${r.year})` : '', r.title ? `${r.title}.` : ''].filter(Boolean);
  const text = parts.length ? parts.join(' ') : r.raw;
  const doi = r.doi ? normalizeDoi(r.doi) : '';
  return doi ? `${text} https://doi.org/${doi}` : text;
}

export function toMarkdown(blocks: Block[], refs: Reference[]): string {
  const body = blocksToText(blocks);
  const list = orderedReferences(blocks, refs);
  if (!list.length) return `${body}\n`;
  const lines = list.map((r, i) => `${i + 1}. ${r.key ? `\`${r.key}\` ` : ''}${formatReference(r)}`);
  return `${body}\n\n## References\n\n${lines.join('\n')}\n`;
}

export function toBibtex(refs: Reference[]): string {
  return refs.map((r, i) => {
    const key = r.key ?? `ref${i + 1}`;
    const f: string[] = [];
    if (r.authors?.length) f.push(`  author = {${r.authors.join(' and ')}}`);
    if (r.title) f.push(`  title = {${r.title}}`);
    if (r.year) f.push(`  year = {${r.year}}`);
    if (r.doi) f.push(`  doi = {${normalizeDoi(r.doi)}}`);
    if (!f.length) f.push(`  note = {${r.raw.replace(/[{}]/g, '')}}`);
    return `@misc{${key},\n${f.join(',\n')}\n}`;
  }).join('\n\n') + (refs.length ? '\n' : '');
}

function splitName(a: string): { family: string; given?: string } {
  if (a.includes(',')) { const [family, ...rest] = a.split(','); return { family: family.trim(), given: rest.join(',').trim() || undefined }; }
  const fam = familyName(a);
  const given = a.trim().slice(0, a.trim().length - fam.length).trim();
  return { family: fam, given: given || undefined };
}

export function toCslJson(refs: Reference[], verifications: Record<string, Verification>): string {
  const items = refs.map((r, i) => {
    const v = verifications[r.id];
    const reg = v?.status === 'verified' ? v.registered : undefined;
    const authors = reg?.authors?.length ? reg.authors : r.authors;
    const year = reg?.year ?? r.year;
    return {
      id: r.key ?? `ref${i + 1}`,
      type: 'document',
      title: reg?.title ?? r.title ?? r.raw,
      author: authors?.map(splitName),
      issued: year ? { 'date-parts': [[year]] } : undefined,
      DOI: r.doi ? normalizeDoi(r.doi) : undefined,
    };
  });
  return JSON.stringify(items, null, 2) + '\n';
}

const LABEL: Record<string, string> = {
  verified: 'Verified', mismatch: 'Mismatch', not_found: 'Not found', uncertain: 'Uncertain',
  invalid_doi: 'Invalid DOI', no_doi: 'No DOI', unchecked: 'Unchecked', checking: 'Checking',
};

export function statusFor(r: Reference, v?: Verification): string {
  if (v) return v.status;
  return r.doi ? 'unchecked' : 'no_doi';
}

export function toCitationReport(refs: Reference[], verifications: Record<string, Verification>, title: string): string {
  const out: string[] = [`# Citation report: ${title}`, '', `> ${DISCLAIMER}`, ''];
  if (!refs.length) out.push('No references in the ledger.');
  for (const r of refs) {
    const v = verifications[r.id];
    const st = statusFor(r, v);
    out.push(`## ${r.key ?? r.title ?? r.doi ?? 'Reference'}`, '', `- Status: ${LABEL[st]}`);
    if (r.doi) out.push(`- DOI: ${normalizeDoi(r.doi)}`);
    if (v?.reason) out.push(`- Reason: ${v.reason}`);
    if (v?.fields?.length) for (const f of v.fields) out.push(`- ${f.field}: you entered "${f.claimed}", registered "${f.registered}" (${f.match ? 'matches' : 'differs'})`);
    out.push(`- Provider: ${v?.checkedAt ? `${v.provider ?? 'doi.org'}${v.agency ? ` via ${v.agency}` : ''}` : 'not checked'}`);
    out.push(`- Checked at: ${v?.checkedAt ?? 'never'}`, '');
  }
  return out.join('\n');
}

export function localDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function exportName(blocks: Block[], ext: string, suffix = '', d = new Date()): string {
  return `${slug(titleOf(blocks))}${suffix}-${localDate(d)}.${ext}`;
}

export function download(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
