import { describe, expect, it } from 'vitest';
import { blocksToText, headingFor, isHeading, readImport, slug, splitIntoBlocks, titleOf } from '../../src/lib/manuscript.ts';

describe('manuscript blocks', () => {
  it('splits at blank lines and detects headings', () => {
    const b = splitIntoBlocks('# Title\n\nFirst para\nstill first.\n\n\n\nSecond.\n');
    expect(b.map((x) => x.text)).toEqual(['# Title', 'First para\nstill first.', 'Second.']);
    expect(isHeading(b[0].text)).toBe(true);
    expect(isHeading(b[1].text)).toBe(false);
    expect(new Set(b.map((x) => x.id)).size).toBe(3);
  });
  it('round-trips and finds title and heading context', () => {
    const b = splitIntoBlocks('# T\n\n## S\n\nbody');
    expect(blocksToText(b)).toBe('# T\n\n## S\n\nbody');
    expect(titleOf(b)).toBe('T');
    expect(headingFor(b, b[2].id)).toBe('S');
  });
  it('slugs names', () => expect(slug('Remembering Long Contexts: A Short Note')).toBe('remembering-long-contexts-a-short-note'));
});

describe('readImport', () => {
  const file = (name: string, bytes: Uint8Array) => ({ name, size: bytes.length, arrayBuffer: async () => bytes.buffer as ArrayBuffer });
  it('accepts md/txt UTF-8', async () => {
    expect(await readImport(file('a.md', new TextEncoder().encode('héllo')))).toEqual({ ok: true, text: 'héllo' });
  });
  it('rejects other types, big files and invalid UTF-8', async () => {
    expect((await readImport(file('a.pdf', new Uint8Array(3)))).ok).toBe(false);
    expect((await readImport(file('a.txt', new Uint8Array(200 * 1024 + 1)))).ok).toBe(false);
    expect((await readImport(file('a.txt', new Uint8Array([0xff, 0xfe, 0xfd])))).ok).toBe(false);
  });
});
