export interface BibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

const ACCENTS: Record<string, string> = {
  "'a": 'á', "'e": 'é', "'i": 'í', "'o": 'ó', "'u": 'ú', '"a': 'ä', '"o': 'ö', '"u': 'ü',
  '`a': 'à', '`e': 'è', '^o': 'ô', '~n': 'ñ', 'cc': 'ç',
};

export function cleanLatex(s: string): string {
  return s
    .replace(/\\(['"`^~])\{?([a-zA-Z])\}?/g, (m, a: string, b: string) => ACCENTS[a + b] ?? b)
    .replace(/\\c\{?c\}?/g, 'ç')
    .replace(/\\ss\b/g, 'ß')
    .replace(/\\&/g, '&')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse BibTeX entries (@type{key, field = {..} | ".." | number, ...}). Tolerates nested braces. */
export function parseBibtex(text: string): BibEntry[] {
  const entries: BibEntry[] = [];
  let i = 0;
  while ((i = text.indexOf('@', i)) >= 0) {
    const head = /^@\s*([A-Za-z]+)\s*([{(])/.exec(text.slice(i));
    if (!head) { i++; continue; }
    const type = head[1].toLowerCase();
    const open = head[2];
    const close = open === '{' ? '}' : ')';
    let p = i + head[0].length;
    if (type === 'comment' || type === 'string' || type === 'preamble') { i = p; continue; }
    const keyEnd = text.indexOf(',', p);
    if (keyEnd < 0) break;
    const key = text.slice(p, keyEnd).trim();
    p = keyEnd + 1;
    const fields: Record<string, string> = {};
    for (;;) {
      while (p < text.length && /[\s,]/.test(text[p])) p++;
      if (p >= text.length || text[p] === close) { p++; break; }
      const nameMatch = /^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*/.exec(text.slice(p));
      if (!nameMatch) { p++; continue; }
      const name = nameMatch[1].toLowerCase();
      p += nameMatch[0].length;
      let value = '';
      if (text[p] === '{') {
        let depth = 0;
        const start = p + 1;
        for (; p < text.length; p++) {
          if (text[p] === '{') depth++;
          else if (text[p] === '}' && --depth === 0) break;
        }
        value = text.slice(start, p);
        p++;
      } else if (text[p] === '"') {
        const start = ++p;
        let depth = 0;
        for (; p < text.length; p++) {
          if (text[p] === '{') depth++;
          else if (text[p] === '}') depth--;
          else if (text[p] === '"' && depth === 0) break;
        }
        value = text.slice(start, p);
        p++;
      } else {
        const m = /^[^,}\s]+/.exec(text.slice(p));
        value = m?.[0] ?? '';
        p += value.length;
      }
      fields[name] = value;
    }
    entries.push({ type, key, fields });
    i = p;
  }
  return entries;
}

export function splitAuthors(s: string): string[] {
  return cleanLatex(s).split(/\s+and\s+/i).map((a) => a.trim()).filter(Boolean);
}
