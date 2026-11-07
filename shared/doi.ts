const PREFIX = /^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/i;
export const DOI_VALID = /^10\.\d{4,9}\/\S+$/;
export const DOI_FIND = /10\.\d{4,9}\/[^\s"]+/;

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' };

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

/** Remove trailing punctuation; remove a closing bracket only when it has no opener inside the DOI. */
export function trimTail(s: string): string {
  let out = s;
  for (;;) {
    const last = out.at(-1);
    if (last === undefined) return out;
    if ('.,;:!?\'"'.includes(last)) { out = out.slice(0, -1); continue; }
    const opener = PAIRS[last];
    if (opener && count(out, last) > count(out, opener)) { out = out.slice(0, -1); continue; }
    return out;
  }
}

/** Normalise user input to a bare DOI (original case kept). Returns '' when empty. */
export function normalizeDoi(input: string): string {
  let s = input.trim();
  s = s.replace(PREFIX, '');
  try { s = decodeURIComponent(s); } catch { /* keep as is */ }
  return trimTail(s.trim());
}

/** Case-insensitive comparison key. */
export function doiKey(doi: string): string {
  return normalizeDoi(doi).toLowerCase();
}

export function isValidDoi(doi: string): boolean {
  return DOI_VALID.test(doi);
}

/** Find a DOI inside free text (bibliography line, URL). */
export function extractDoi(text: string): string | undefined {
  const m = DOI_FIND.exec(text);
  if (!m) return undefined;
  let candidate = m[0];
  try { candidate = decodeURIComponent(candidate); } catch { /* keep */ }
  const doi = trimTail(candidate);
  return isValidDoi(doi) ? doi : undefined;
}
