import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const tok = (n: string) => new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1];
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(tok(a)), lum(tok(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('WCAG AA text contrast of token pairs (>= 4.5:1)', () => {
  const pairs: [string, string][] = [
    // writing on ivory
    ['ink', 'ivory'], ['ink-muted', 'ivory'], ['ink-red', 'ivory'], ['amber-ink', 'ivory'], ['verdigris', 'ivory'], ['wet-ink', 'ivory'], ['spectral-ink', 'ivory'],
    ['ink', 'ivory-2'], ['ink-muted', 'ivory-2'], ['ink-red', 'ivory-2'],
    // night ink surfaces
    ['bone', 'night'], ['bone', 'night-3'], ['dust', 'night'], ['dust', 'night-2'], ['dust', 'night-3'],
    ['brass', 'night'], ['brass-lit', 'night-2'], ['spectral', 'night-3'], ['ink-red-lit', 'night-3'], ['amber-lit', 'night-2'], ['verdigris-lit', 'night'],
    // dark text on brass buttons
    ['ink', 'brass'], ['ink', 'brass-lit'],
  ];
  it.each(pairs)('%s on %s', (fg, bg) => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5));
});
