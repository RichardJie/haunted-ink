import { expect, test, type Page } from '@playwright/test';
import { shot } from './shots.ts';

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function loadExample(page: Page) {
  await fresh(page);
  await page.getByRole('button', { name: 'Load the example' }).click();
  await expect(page.locator('#notes-text')).toHaveValue(/STARTER NOTES/);
}

const candle = (page: Page) => page.getByRole('progressbar', { name: 'Words written toward the goal' });
const waxHeight = (page: Page) => page.locator('.wax-body').evaluate((el) => el.getBoundingClientRect().height);

test('first screen shows the three rooms, the ghost reviewers and an unlit candle', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh(page);
  for (const name of ['Research notes', 'Outline', 'Manuscript', 'Ghost reviewers', 'Writing candle']) {
    await expect(page.getByRole('heading', { name: new RegExp(name) }).first()).toBeInViewport();
  }
  await expect(candle(page)).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('.candle')).toHaveClass(/candle-unlit/);
  await expect(page.getByText('Unlit. Write the first sentence')).toBeVisible();
  // Nothing to structure yet: disabled until there are notes. No review or outline text ships with the app.
  await expect(page.getByRole('button', { name: 'Structure into outline' })).toBeDisabled();
  await expect(page.getByText(/not connected/i)).toHaveCount(0);
  await expect(page.locator('.ghost-card')).toHaveCount(0);
  await shot(page, 'room-1440-empty');
});

test('the candle shortens only with body words and keeps its goal across reloads', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh(page);
  const goal = page.getByRole('spinbutton', { name: 'Word goal' });
  await goal.fill('50');
  await goal.press('Enter');
  const full = await waxHeight(page);
  // REGRESSION: a goal clamped to the value it already has must still replace what was typed.
  await goal.fill('0');
  await goal.blur();
  await expect(goal).toHaveValue('50');
  await goal.fill('9999999');
  await goal.press('Enter');
  await expect(goal).toHaveValue('200000');
  await goal.fill('50');
  await goal.press('Enter');
  await expect(goal).toHaveValue('50');
  await page.getByRole('button', { name: 'Start writing' }).click();
  await page.keyboard.type('# A heading is not counted');
  await page.getByRole('button', { name: 'Add a paragraph at the end' }).click();
  const p2 = page.getByRole('textbox', { name: 'Paragraph 2', exact: true });
  await p2.fill('One two three [@lecun2015] four five [evidence needed: a source] six.');
  await expect(candle(page)).toHaveAttribute('aria-valuenow', '6');
  await expect(candle(page)).toHaveAttribute('aria-valuetext', '6 of 50 words, 12 percent');
  await page.waitForTimeout(900); // let the 700 ms wax transition finish
  const after6 = await waxHeight(page);
  expect(after6).toBeLessThan(full);
  // Expected share: stub 8% + 92% of the unwritten 88%.
  expect(after6 / full).toBeCloseTo(0.08 + 0.92 * (44 / 50), 1);
  // Time alone changes nothing.
  await page.waitForTimeout(1500);
  expect(await waxHeight(page)).toBeCloseTo(after6, 0);
  await p2.fill(Array.from({ length: 50 }, (_, i) => `word${i}`).join(' '));
  await expect(candle(page)).toHaveAttribute('aria-valuenow', '50');
  await expect(page.locator('.candle')).toHaveClass(/candle-spent/);
  await expect(page.getByText('Word goal reached')).toBeVisible();
  await page.waitForTimeout(900);
  expect(await waxHeight(page)).toBeLessThan(after6);
  await shot(page, 'room-1440-candle-spent');
  await page.waitForTimeout(800); // debounce save
  await page.reload();
  await expect(goal).toHaveValue('50');
  await expect(candle(page)).toHaveAttribute('aria-valuenow', '50');
});

test('schema 2 work from the previous version survives the upgrade', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  // Written before the app's scripts run, as it would be for a returning user of the previous version.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('haunted-ink:v2', JSON.stringify({
      schema: 2, blocks: [{ id: 'b-old1', text: '# Kept Title' }, { id: 'b-old2', text: 'A paragraph written before the upgrade.' }],
      references: [{ id: 'r1', raw: '10.1038/nature14539', doi: '10.1038/nature14539', source: 'doi' }], verifications: {},
      history: [{ id: 'h1', blockId: 'b-old2', before: 'Old.', after: 'A paragraph written before the upgrade.', intent: 'Tighten', appliedAt: '2026-11-06T10:00:00.000Z' }],
    }));
  });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Paragraph 2', exact: true })).toHaveValue('A paragraph written before the upgrade.');
  await expect(page.getByText('could not be restored')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /References/ })).toContainText('1');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  // The old copy is left in place as a backup.
  expect(await page.evaluate(() => localStorage.getItem('haunted-ink:v2'))).toContain('before the upgrade');
});

test('example workspace at 1440, 1024, 768 and 375; references live in a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loadExample(page);
  await expect(page.getByRole('heading', { name: /Ghost reviewers/ })).toBeInViewport();
  await expect(page.getByRole('button', { name: /Summon the ghost reviewers for paragraph 3/ })).toBeEnabled();
  await expect(page.locator('.ghost-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Structure into outline' })).toBeEnabled();
  await shot(page, 'room-1440-example');
  const para = page.getByRole('textbox', { name: 'Paragraph 5', exact: true });
  await para.click();
  await para.press('End');
  await shot(page, 'room-1440-editing');
  await page.getByRole('button', { name: /References/ }).click();
  const drawer = page.getByRole('dialog', { name: 'References' });
  await expect(drawer.getByRole('heading', { name: 'Reference ledger' })).toBeVisible();
  await page.waitForTimeout(400); // drawer slide-in
  await shot(page, 'room-1440-references');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);

  for (const [w, h] of [[1024, 768], [768, 1024], [375, 812]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => window.scrollTo(0, 0));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `no horizontal scroll at ${w}`).toBeLessThanOrEqual(0);
    await shot(page, `room-${w}-example`);
  }
  // Narrow: one room at a time, candle always visible.
  await page.getByRole('button', { name: 'I Notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Research notes' })).toBeVisible();
  await expect(candle(page)).toBeVisible();
  await shot(page, 'room-375-notes');
  await page.getByRole('button', { name: 'II Outline', exact: true }).click();
  await page.getByRole('button', { name: 'Add a section' }).click();
  await page.getByRole('textbox', { name: 'Section 1 heading' }).fill('Why gates help');
  await page.getByRole('textbox', { name: /Section 1 brief/ }).fill('Gated recurrence keeps a signal alive over long spans.');
  await page.getByRole('textbox', { name: /Add a claim in section 1/ }).fill('Vanishing gradients in plain RNNs');
  await page.getByRole('textbox', { name: /Add a claim in section 1/ }).press('Enter');
  await expect(page.getByText('Evidence needed').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Draft a paragraph for section 1/ })).toBeEnabled();
  await shot(page, 'room-375-outline');
  await page.reload();
  await page.getByRole('button', { name: 'II Outline', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Section 1 heading' })).toHaveValue('Why gates help');
});

// Presentational check of ghost cards. The review below is a TEST FIXTURE written into
// localStorage by this test only; the shipped app never contains or produces it.
const FIXTURE = (blockId: string, text: string) => ({
  id: 'fixture-review', blockId, sourceText: text, reviewedAt: '2026-11-07T21:14:00.000Z',
  findings: [
    { id: 'f1', category: 'logic', quote: text.slice(0, 40), critique: 'TEST FIXTURE: layout check of a logic card.', advice: 'TEST FIXTURE advice.', state: 'open' },
    { id: 'f2', category: 'evidence', quote: text.slice(41, 90), critique: 'TEST FIXTURE: layout check of an evidence card.', advice: 'TEST FIXTURE advice.', state: 'open' },
  ],
});

for (const vp of [{ w: 1440, h: 900, side: true }, { w: 375, h: 812, side: false }]) {
  test(`ghost cards sit ${vp.side ? 'beside' : 'below'} their paragraph at ${vp.w} px and go stale after an edit`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await loadExample(page);
    await page.waitForTimeout(800);
    const target = await page.evaluate(() => JSON.parse(localStorage.getItem('haunted-ink:v3')!).blocks.find((x: { text: string }) => x.text.startsWith('Recurrent networks')) as { id: string; text: string });
    // Injected at the next document start, after the old page has saved its own state.
    await page.addInitScript((review) => {
      if (sessionStorage.getItem('fixture')) return;
      sessionStorage.setItem('fixture', '1');
      const saved = JSON.parse(localStorage.getItem('haunted-ink:v3')!);
      saved.reviews = { [review.blockId]: review };
      localStorage.setItem('haunted-ink:v3', JSON.stringify(saved));
    }, FIXTURE(target.id, target.text));
    await page.reload();
    const row = page.locator('.folio-row', { hasText: 'Recurrent networks pass' });
    const cards = row.locator('.ghost-card');
    await expect(cards).toHaveCount(2);
    await cards.first().scrollIntoViewIfNeeded();
    const field = await row.locator('.field').boundingBox();
    for (const c of await cards.all()) {
      const b = (await c.boundingBox())!;
      if (vp.side) expect(b.x).toBeGreaterThanOrEqual(field!.x + field!.width);
      else expect(b.y).toBeGreaterThanOrEqual(field!.y + field!.height);
    }
    await shot(page, `ghost-cards-${vp.w}`);
    await cards.first().getByRole('button', { name: 'Resolve' }).click();
    await expect(row.getByText('1 settled concern')).toBeVisible();
    const ta = row.locator('textarea');
    await ta.click();
    await ta.press('Control+End');
    await page.keyboard.type(' Edited.');
    await expect(row.getByText(/edited this paragraph after the ghosts read it/)).toBeVisible();
    await expect(row.locator('.ghost-margin > .ghost-card.stale')).toHaveCount(1);
    await shot(page, `ghost-cards-${vp.w}-stale`);
  });
}
