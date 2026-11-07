import { doiKey, extractDoi, isValidDoi, normalizeDoi } from '../../shared/doi.ts';
import type { Reference } from '../../shared/types.ts';
import { cleanLatex, parseBibtex, splitAuthors } from './bibtex.ts';
import { uid } from './uid.ts';

export const MAX_REFERENCES = 100;
export const MAX_ENTRY_CHARS = 2000;

export interface ParseOutcome {
  added: Reference[];
  messages: string[];
}

const DOI_LINE = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+$/i;

function firstFamily(authors?: string[]): string | undefined {
  return authors?.[0];
}
export { firstFamily };

function duplicateOf(doi: string | undefined, existing: Reference[]): Reference | undefined {
  if (!doi) return undefined;
  const k = doiKey(doi);
  return existing.find((r) => r.doi && doiKey(r.doi) === k);
}

/** Parse pasted text into references. Format is detected per paste: BibTeX, DOI list, or bibliography lines. */
export function parseReferences(input: string, existing: Reference[]): ParseOutcome {
  const messages: string[] = [];
  const added: Reference[] = [];
  const text = input.trim();
  if (!text) return { added, messages: ['Paste a DOI, a BibTeX entry, or a bibliography line first.'] };

  const room = () => MAX_REFERENCES - existing.length - added.length;
  const push = (r: Omit<Reference, 'id'>, label: string) => {
    if (room() <= 0) { messages.push(`The ledger holds at most ${MAX_REFERENCES} references. "${label}" was not added.`); return; }
    const dupe = duplicateOf(r.doi, [...existing, ...added]);
    if (dupe) { messages.push(`"${label}" has the same DOI as the existing entry ${dupe.key ?? dupe.title ?? dupe.doi}. It was not added.`); return; }
    if (r.key && [...existing, ...added].some((x) => x.key === r.key)) {
      messages.push(`The key "${r.key}" is already used. "${label}" was not added.`);
      return;
    }
    added.push({ ...r, id: uid('ref') });
  };

  if (text.startsWith('@')) {
    const entries = parseBibtex(text);
    if (!entries.length) messages.push('That looks like BibTeX but no complete entry could be read. Check the braces.');
    for (const e of entries) {
      const raw = text.length > MAX_ENTRY_CHARS ? '' : text;
      if (JSON.stringify(e).length > MAX_ENTRY_CHARS) { messages.push(`Entry "${e.key}" is longer than ${MAX_ENTRY_CHARS} characters and was skipped.`); continue; }
      const f = e.fields;
      const doiRaw = f.doi ? normalizeDoi(cleanLatex(f.doi)) : undefined;
      const year = f.year ? Number(/\d{4}/.exec(f.year)?.[0]) : undefined;
      push({
        key: e.key || undefined,
        doi: doiRaw || undefined,
        title: f.title ? cleanLatex(f.title) : undefined,
        authors: f.author ? splitAuthors(f.author) : undefined,
        year: year && Number.isFinite(year) ? year : undefined,
        raw: raw || `@${e.type}{${e.key}, …}`,
        source: 'bibtex',
      }, e.key || f.title || 'BibTeX entry');
    }
    return { added, messages };
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const allDois = lines.every((l) => DOI_LINE.test(l));
  for (const line of lines) {
    if (line.length > MAX_ENTRY_CHARS) { messages.push(`A line longer than ${MAX_ENTRY_CHARS} characters was skipped.`); continue; }
    if (allDois) {
      const doi = normalizeDoi(line);
      push({ doi, raw: line, source: 'doi' }, doi);
      continue;
    }
    const doi = extractDoi(line);
    const year = /\b(19|20)\d{2}\b/.exec(line)?.[0];
    const quoted = /[“"]([^”"]{6,})[”"]/.exec(line)?.[1];
    push({ doi, title: quoted?.replace(/[.,]$/, ''), year: year ? Number(year) : undefined, raw: line, source: 'line' }, doi ?? line.slice(0, 40));
  }
  return { added, messages };
}

export function doiProblem(ref: Reference): 'invalid_doi' | 'no_doi' | undefined {
  if (!ref.doi) return 'no_doi';
  return isValidDoi(normalizeDoi(ref.doi)) ? undefined : 'invalid_doi';
}
