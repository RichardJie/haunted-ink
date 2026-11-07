import type { Protected } from '../../shared/protect.ts';

export interface ReviserOutput { revised: string; changes: string[]; declined: string[] }
export type ParseResult = { ok: true; value: ReviserOutput } | { ok: false; problem: string };

/** JSON-encodes a request so no user text can close or fake the delimiter. */
function wrap(payload: object): string {
  const body = JSON.stringify(payload).replaceAll('>>>', '\\u003e\\u003e\\u003e').replaceAll('<<<', '\\u003c\\u003c\\u003c');
  return `<<<HAUNTED_INK_REQUEST\n${body}\nHAUNTED_INK_REQUEST>>>\n`;
}

export function buildPrompt(req: { intent: string; heading?: string; protectedText: Protected }): string {
  return wrap({
    intent: req.intent,
    heading: req.heading ?? '',
    paragraph: req.protectedText.text,
    placeholders: req.protectedText.placeholders,
  });
}

export type EditorRequest =
  | { task: 'structure'; notes: string; knownKeys: string[] }
  | { task: 'draft'; heading: string; brief: string; evidence: { claim: string; status: string; keys: string[] }[]; notes: string; knownKeys: string[]; before: string; after: string }
  | { task: 'review'; heading: string; paragraph: string; placeholders: string[] };

/** Prompt for the tool-less editor agent. The `task` field alone selects the output contract. */
export const buildEditorPrompt = (req: EditorRequest): string => wrap(req);

/** First balanced top-level JSON object in the text (string-aware). */
export function firstJsonObject(text: string): string | undefined {
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        const candidate = text.slice(start, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { break; }
      }
    }
  }
  return undefined;
}

const isStrings = (v: unknown, max: number): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.length <= 600);

/** The first JSON object in Kiro's final text, parsed; fenced or surrounded by prose is tolerated. */
export function parseJsonReply(finalText: string): { ok: true; value: unknown } | { ok: false; problem: string } {
  const json = firstJsonObject(finalText);
  if (!json) return { ok: false, problem: 'Kiro did not return a JSON object.' };
  return { ok: true, value: JSON.parse(json) };
}

export function parseReviserOutput(finalText: string): ParseResult {
  const json = firstJsonObject(finalText);
  if (!json) return { ok: false, problem: 'Kiro did not return a JSON object.' };
  const v = JSON.parse(json) as Record<string, unknown>;
  if (typeof v.revised !== 'string' || !v.revised.trim()) return { ok: false, problem: 'The reply has no "revised" text.' };
  if (v.revised.length > 6000) return { ok: false, problem: 'The revised text is longer than 6,000 characters.' };
  const changes = v.changes ?? [];
  const declined = v.declined ?? [];
  if (!isStrings(changes, 5)) return { ok: false, problem: '"changes" must be a list of at most 5 short strings.' };
  if (!isStrings(declined, 3)) return { ok: false, problem: '"declined" must be a list of at most 3 short strings.' };
  return { ok: true, value: { revised: v.revised, changes, declined } };
}
