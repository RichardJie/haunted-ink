import { diffWords } from 'diff';

export interface Piece { kind: 'same' | 'del' | 'ins'; text: string }

export function wordDiff(before: string, after: string): Piece[] {
  return diffWords(before, after).map((p) => ({ kind: p.added ? 'ins' : p.removed ? 'del' : 'same', text: p.value }));
}
