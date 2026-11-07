import { expect, test, type Page } from '@playwright/test';
import { shot } from './shots.ts';

// The focused editing field must keep its focus ring inside its own box, and the
// paragraph controls must sit in separately reserved space (user bug report: a short
// focused paragraph "sad" had a large outline drawn over the "Revise with Kiro" row).

interface Rect { l: number; t: number; r: number; b: number }

/** The painted focus ring of the active element (outline plus a positive offset), and every other visible control. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const ringOf = (n: HTMLElement) => {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      const w = cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth) || 0;
      const grow = Math.max(0, w + (parseFloat(cs.outlineOffset) || 0));
      return { l: r.left - grow, t: r.top - grow, r: r.right + grow, b: r.bottom + grow, width: w, style: cs.outlineStyle };
    };
    const ring = ringOf(el);
    const field = el.closest('.field') as HTMLElement | null;
    const fieldBox = field?.getBoundingClientRect();
    // Sticky or fixed bars legitimately float above scrolled content; they are checked separately below.
    const floating = (n: HTMLElement) => { for (let a: HTMLElement | null = n; a; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === 'sticky' || p === 'fixed') return a; } return null; };
    const bar = [...document.querySelectorAll<HTMLElement>('.room-switch')].find((n) => getComputedStyle(n).display !== 'none');
    const barBottom = bar ? bar.getBoundingClientRect().bottom : 0;
    const controls = [...document.querySelectorAll<HTMLElement>('button, a[href], input:not([type=file]), textarea')]
      .filter((n) => n !== el && n.offsetParent !== null && !field?.contains(n) && !floating(n))
      .map((n) => { const r = n.getBoundingClientRect(); return { name: n.getAttribute('aria-label') ?? n.textContent?.trim().slice(0, 40) ?? n.tagName, l: r.left, t: r.top, r: r.right, b: r.bottom }; })
      .filter((c) => c.r > c.l && c.b > c.t);
    const caretVisible = el.getBoundingClientRect().bottom > barBottom;
    return { caretVisible, ring, field: fieldBox ? { l: fieldBox.left, t: fieldBox.top, r: fieldBox.right, b: fieldBox.bottom } : null, controls, tag: el.tagName };
  });
}

const overlap = (a: Rect, b: Rect) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;

async function assertClean(page: Page, label: string) {
  const m = await measure(page);
  expect(m.tag, label).toBe('TEXTAREA');
  expect(m.ring.style, `${label}: focus ring visible`).not.toBe('none');
  expect(m.ring.width, `${label}: focus ring at least 2px`).toBeGreaterThanOrEqual(2);
  // The ring stays inside the reserved editor area.
  expect(m.field, label).not.toBeNull();
  expect(m.ring.l, `${label}: ring left inside field`).toBeGreaterThanOrEqual(m.field!.l - 0.5);
  expect(m.ring.t, `${label}: ring top inside field`).toBeGreaterThanOrEqual(m.field!.t - 0.5);
  expect(m.ring.r, `${label}: ring right inside field`).toBeLessThanOrEqual(m.field!.r + 0.5);
  expect(m.ring.b, `${label}: ring bottom inside field`).toBeLessThanOrEqual(m.field!.b + 0.5);
  const hits = m.controls.filter((c) => overlap(m.ring, c) || overlap(m.field!, c)).map((c) => `${c.name} @${Math.round(c.l)},${Math.round(c.t)}-${Math.round(c.r)},${Math.round(c.b)} vs field ${Math.round(m.field!.l)},${Math.round(m.field!.t)}-${Math.round(m.field!.r)},${Math.round(m.field!.b)}`);
  expect(hits, `${label}: controls overlapping the focused field`).toEqual([]);
  expect(m.caretVisible, `${label}: focused field not hidden under the sticky room switch`).toBe(true);
}

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function writeShort(page: Page) {
  await page.getByRole('button', { name: 'Start writing' }).click();
  const ta = page.getByRole('textbox', { name: 'Paragraph 1', exact: true });
  await expect(ta).toBeFocused();
  await page.keyboard.type('sad');
  return ta;
}

const LONG = 'Recurrent networks pass a hidden state from step to step, and early versions struggled to keep a signal alive over long spans because the training signal faded as it travelled backwards through time. Gated units were introduced to give the network an explicit path along which information can persist, with learned gates deciding what to write, keep and erase.';

for (const vp of [
  { name: '1440', width: 1440, height: 900, scale: 1 },
  { name: '1024', width: 1024, height: 768, scale: 1 },
  { name: '768', width: 768, height: 1024, scale: 1 },
  { name: '375', width: 375, height: 812, scale: 1 },
  // 200% browser zoom of a 1440 x 900 window is a 720 x 450 CSS viewport at device scale 2.
  { name: 'zoom200', width: 720, height: 450, scale: 2 },
]) {
  test.describe(`editor geometry at ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale });

    test('short, long, blank and keyboard-focused paragraphs keep the ring off the controls', async ({ page }) => {
      await fresh(page);
      const ta = await writeShort(page);
      if (vp.name === '1440' || vp.name === '375' || vp.name === 'zoom200') await shot(page, `geometry-${vp.name}-short-focus`);
      await assertClean(page, 'short paragraph');

      // Long paragraph in the same field.
      await ta.fill(LONG);
      await ta.focus();
      if (vp.name === '1440' || vp.name === '375') await shot(page, `geometry-${vp.name}-long-focus`);
      await assertClean(page, 'long paragraph');

      // A new blank paragraph below (controls are reserved for the paragraph above).
      await page.getByRole('button', { name: /Add a paragraph after paragraph 1/ }).click();
      const blank = page.getByRole('textbox', { name: 'Paragraph 2', exact: true });
      await blank.focus();
      await assertClean(page, 'blank paragraph');

      // Keyboard focus: Shift+Tab back from the first paragraph's controls into the field.
      await ta.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(ta).toBeFocused();
      await assertClean(page, 'keyboard focus');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'no horizontal scrolling of the shell').toBeLessThanOrEqual(0);
    });
  });
}

test('200% text zoom (root font size doubled) keeps the ring off the controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fresh(page);
  // Chrome's text-size setting scales the root font size; CSSOM changes are allowed by the CSP.
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await writeShort(page);
  await shot(page, 'geometry-textzoom200-short-focus');
  await assertClean(page, 'text zoom 200%');
});
