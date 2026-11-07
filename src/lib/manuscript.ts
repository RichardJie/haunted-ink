import type { Block } from '../../shared/types.ts';
import { uid } from './uid.ts';

export const isHeading = (text: string): boolean => /^#{1,6}\s/.test(text.trimStart());

/** Split text at blank lines. Each block gets a fresh stable id. */
export function splitIntoBlocks(text: string): Block[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((t) => t.replace(/^\n+|\s+$/g, ''))
    .filter((t) => t.trim().length > 0)
    .map((t) => ({ id: uid('b'), text: t }));
}

export function blocksToText(blocks: Block[]): string {
  return blocks.map((b) => b.text.trim()).filter(Boolean).join('\n\n');
}

export function headingFor(blocks: Block[], blockId: string): string | undefined {
  let heading: string | undefined;
  for (const b of blocks) {
    if (b.id === blockId) return heading;
    if (isHeading(b.text)) heading = b.text.replace(/^#+\s*/, '');
  }
  return heading;
}

export function titleOf(blocks: Block[]): string {
  const h = blocks.find((b) => /^#\s/.test(b.text.trimStart()));
  return h ? h.text.replace(/^#+\s*/, '').split('\n')[0].trim() : 'untitled-manuscript';
}

export function slug(s: string): string {
  const t = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return t.slice(0, 60) || 'manuscript';
}

export const MAX_IMPORT_BYTES = 200 * 1024;

export type ImportResult = { ok: true; text: string } | { ok: false; message: string };

export async function readImport(file: { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<ImportResult> {
  if (!/\.(md|markdown|txt)$/i.test(file.name)) return { ok: false, message: 'Only .md, .markdown and .txt files can be imported. The manuscript was not changed.' };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, message: 'That file is larger than 200 KB. The manuscript was not changed.' };
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    return { ok: true, text };
  } catch {
    return { ok: false, message: 'That file is not valid UTF-8 text. The manuscript was not changed.' };
  }
}
