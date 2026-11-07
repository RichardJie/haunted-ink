import { expect, test, type Locator, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { expectCandleMatchesPage } from './candle.ts';
import { shot } from './shots.ts';

// ONE real flow through the three editorial calls with the real local Kiro CLI. No mocks, no injected model output.
// The only text written by this test is clearly labelled as test input.
const PRE = 'PRE-EXISTING TEST PARAGRAPH: this sentence was typed by the author before any drafting and must survive every later step unchanged.';
const OVERCLAIM = 'TEST PARAGRAPH (written by the end-to-end test to provoke a logic concern): Our method is universally superior to every other approach in every possible setting, so no evaluation or comparison against alternatives is needed.';

const para = (page: Page, text: string): Locator => page.locator('.folio-row').filter({ hasText: text }).first();
const values = (page: Page) => page.locator('.block textarea').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
const keysIn = (text: string) => new Set([...text.matchAll(/\[@([\w:-]+)\]/g)].map((m) => m[1].toLowerCase()));
const count = (pattern: string) => new Promise<number>((res) => execFile('pgrep', ['-f', pattern], (_e, out) => res(out.split('\n').filter(Boolean).length)));

/** Focus a field and put the caret after its last character (Control+End is not End-of-text on macOS). */
const caretToEnd = (field: Locator) => field.evaluate((el) => { const t = el as HTMLTextAreaElement; t.focus(); t.setSelectionRange(t.value.length, t.value.length); });

async function quotesAreExact(row: Locator, paragraph: string) {
  const quotes = await row.locator('.ghost-card blockquote').allInnerTexts();
  expect(quotes.length).toBeGreaterThan(0);
  for (const q of quotes) {
    const inner = q.trim().replace(/^“/, '').replace(/”$/, '');
    expect(paragraph.includes(inner), `quote must be an exact substring: ${inner}`).toBe(true);
  }
}

test('notes → outline → draft → insert → ghost review → stale → review again → resolve → reload (real Kiro)', async ({ page }) => {
  test.setTimeout(1_200_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText(/Kiro CLI ready/)).toBeVisible();

  // Pre-existing manuscript text, typed by the "author".
  await page.getByRole('button', { name: 'Start writing' }).click();
  await page.keyboard.type('# End-to-end real flow (test input)');
  await page.getByRole('button', { name: 'Add a paragraph at the end' }).click();
  const p2 = page.getByRole('textbox', { name: 'Paragraph 2', exact: true });
  await p2.fill(PRE);
  await p2.blur();
  const candle0 = await expectCandleMatchesPage(page);

  // ---- 1. Notes → outline (real call) ----
  await page.getByRole('button', { name: 'load the starter notes' }).click();
  const notes = page.locator('#notes-text');
  await expect(notes).toHaveValue(/STARTER NOTES/);
  const notesKeys = keysIn(await notes.inputValue());
  await expect(page.getByRole('button', { name: 'Structure into outline' })).toBeEnabled();
  await page.getByRole('button', { name: 'Structure into outline' }).click();
  await expect(page.locator('.notes-panel .task-line')).toContainText(/Sending to Kiro|Queued|structuring the notes/);
  await expect(page.locator('.outline-item').first()).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('.flash')).toContainText('Outline ready');
  const sections = await page.locator('.outline-item').count();
  expect(sections).toBeGreaterThanOrEqual(2);
  expect(await page.locator('.outline-item .item-heading').first().inputValue()).not.toBe('');
  // Every cited key comes from the notes (the ledger is empty here). Evidence needed stays marked as needed.
  for (const k of await page.locator('.ev-cited .ev-key + span').allInnerTexts()) {
    for (const m of k.matchAll(/@([\w:-]+)/g)) expect(notesKeys.has(m[1].toLowerCase()), `cited key ${m[1]} must be in the notes`).toBe(true);
  }
  await expect(page.getByRole('button', { name: 'Restructure into outline' })).toBeEnabled();
  await shot(page, 'real-1-outline-1440');
  const headingsBefore = await page.locator('.outline-item .item-heading').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

  // ---- 2. Edit a brief, draft ONE paragraph (real call), preview, insert ----
  const brief = page.getByRole('textbox', { name: /Section 1 brief/ });
  const briefBefore = await brief.inputValue();
  await caretToEnd(brief);
  await page.keyboard.type(' Keep it to three sentences.');
  expect(await brief.inputValue()).toBe(`${briefBefore} Keep it to three sentences.`);
  const blocksBefore = await values(page);
  await page.getByRole('button', { name: /Draft a paragraph for section 1/ }).click();
  await expect(page.locator('.outline-item').first().locator('.task-line')).toContainText(/Sending to Kiro|Queued|drafting/);
  const preview = page.getByRole('group', { name: 'Drafted paragraph preview' });
  await expect(preview).toBeVisible({ timeout: 150_000 });
  const draftText = (await preview.locator('.draft-text').innerText()).trim();
  expect(draftText.length).toBeGreaterThan(80);
  expect(draftText).not.toMatch(/\n\s*\n/);
  expect(await values(page)).toEqual(blocksBefore); // preview only: the manuscript is untouched
  for (const k of keysIn(draftText)) expect(notesKeys.has(k), `draft key ${k} must be supplied by the notes`).toBe(true);
  await shot(page, 'real-2-draft-preview-1440');
  // Editing the brief after asking marks the draft out of date; restoring it clears the warning.
  await caretToEnd(brief);
  await page.keyboard.type('!');
  await expect(preview.getByText(/changed this section or the notes after asking/)).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Insert anyway' })).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(preview.getByText(/changed this section or the notes after asking/)).toHaveCount(0);
  await preview.getByRole('button', { name: 'Insert into manuscript' }).click();
  await expect(preview).toHaveCount(0);
  const blocksAfter = await values(page);
  expect(blocksAfter).toHaveLength(blocksBefore.length + 1);
  expect(blocksAfter.slice(0, blocksBefore.length)).toEqual(blocksBefore); // existing text unchanged, new paragraph appended
  expect(blocksAfter.at(-1)!.startsWith(draftText)).toBe(true);
  const candle1 = await expectCandleMatchesPage(page);
  expect(candle1.words).toBeGreaterThan(candle0.words);
  expect(candle1.height).toBeLessThan(candle0.height);
  await expect(page.getByRole('button', { name: 'Show paragraph' })).toBeVisible();
  await shot(page, 'real-3-draft-inserted-1440');

  // ---- 3. Ghost review of a labelled overclaiming paragraph (real call) ----
  await page.getByRole('button', { name: 'Add a paragraph at the end' }).click();
  const last = page.getByRole('textbox', { name: `Paragraph ${blocksAfter.length + 1}`, exact: true });
  await last.fill(OVERCLAIM);
  await last.blur();
  const row = para(page, 'TEST PARAGRAPH (written');
  await row.scrollIntoViewIfNeeded();
  await row.getByRole('button', { name: /Summon the ghost reviewers/ }).click();
  await expect(row.locator('.ghost-reading')).toBeVisible();
  await expect(row.locator('.ghost-card').first().or(row.locator('.quiet-review'))).toBeVisible({ timeout: 150_000 });
  if (await row.locator('.quiet-review').count()) {
    // An honest zero is valid, but this paragraph deserves a concern: ask once more before failing.
    await row.getByRole('button', { name: /Review again/ }).click();
    await expect(row.locator('.ghost-card').first()).toBeVisible({ timeout: 150_000 });
  }
  const cards = row.locator('.ghost-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(1);
  expect(await cards.count()).toBeLessThanOrEqual(5);
  await quotesAreExact(row, OVERCLAIM);
  await expect(cards.first().locator('.cat-word')).toHaveText(/Logic|Evidence|Clarity/);
  await expect(row.locator('.ghost-margin')).not.toContainText(/citation (is|was) (valid|fake)/i);

  // Layout: beside the paragraph on wide screens, below it on narrow ones, every width, no horizontal scroll.
  for (const [w, h, side] of [[1440, 900, true], [1024, 768, true], [768, 1024, false], [375, 812, false]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await row.scrollIntoViewIfNeeded();
    const field = (await row.locator('.field').boundingBox())!;
    for (const c of await cards.all()) {
      const b = (await c.boundingBox())!;
      if (side) {
        expect(b.x, `card beside the paragraph at ${w}`).toBeGreaterThanOrEqual(field.x + field.width - 1);
      } else expect(b.y, `card below the paragraph at ${w}`).toBeGreaterThanOrEqual(field.y + field.height - 1);
      expect(b.x + b.width, `card inside the viewport at ${w}`).toBeLessThanOrEqual(w + 1);
      expect(b.x).toBeGreaterThanOrEqual(0);
    }
    if (side) {
      const first = (await cards.first().boundingBox())!;
      expect(first.y, `first card starts level with its paragraph at ${w}`).toBeGreaterThanOrEqual(field.y - 2);
      expect(first.y, `first card starts level with its paragraph at ${w}`).toBeLessThanOrEqual(field.y + field.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await shot(page, `real-4-ghost-cards-${w}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---- 4. Cancel a real run: nothing arrives afterwards ----
  const pre = para(page, 'PRE-EXISTING TEST PARAGRAPH');
  await pre.scrollIntoViewIfNeeded();
  await pre.getByRole('button', { name: /Summon the ghost reviewers/ }).click();
  await expect(pre.locator('.ghost-reading')).toBeVisible();
  await pre.getByRole('button', { name: 'Cancel' }).click();
  await expect(pre.locator('.ghost-reading')).toHaveCount(0);
  await page.waitForTimeout(6000); // a late answer would have time to show up
  await expect(pre.locator('.ghost-card, .quiet-review, .ghost-failed')).toHaveCount(0);
  await expect(pre.getByRole('button', { name: /Summon the ghost reviewers/ })).toBeEnabled();

  // ---- 5. Edit the source → stale immediately → Review again (real call) → Resolve ----
  await row.scrollIntoViewIfNeeded();
  const ta = row.locator('textarea');
  await caretToEnd(ta);
  await page.keyboard.type(' Edited.');
  await expect(row.getByText(/edited this paragraph after the ghosts read it/)).toBeVisible();
  expect(await row.locator('.ghost-margin > .ghost-card.stale').count()).toBeGreaterThanOrEqual(1);
  await shot(page, 'real-5-ghost-stale-1440');
  const edited = await ta.inputValue();
  await row.getByRole('button', { name: /Review again/ }).click();
  await expect(row.locator('.ghost-reading')).toBeVisible();
  await expect(row.locator('.ghost-reading')).toHaveCount(0, { timeout: 150_000 });
  await expect(row.getByText(/edited this paragraph after the ghosts read it/)).toHaveCount(0);
  await expect(row.locator('.ghost-card').first()).toBeVisible();
  await quotesAreExact(row, edited);
  const open = await row.locator('.ghost-margin > .ghost-card').count();
  await row.locator('.ghost-margin > .ghost-card').first().getByRole('button', { name: 'Resolve' }).click();
  await expect(row.getByText('1 settled concern')).toBeVisible();
  await expect(row.locator('.ghost-margin > .ghost-card')).toHaveCount(open - 1);
  await row.getByText('1 settled concern').click();
  await row.getByRole('button', { name: 'Reopen' }).click();
  await expect(row.locator('.ghost-margin > .ghost-card')).toHaveCount(open);
  await row.locator('.ghost-margin > .ghost-card').first().getByRole('button', { name: 'Resolve' }).click();
  await shot(page, 'real-6-ghost-resolved-1440');

  // ---- 6. Notes change while Kiro restructures: the result is never silently applied (real call) ----
  const outlineBefore = await page.locator('.outline-item .item-brief').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  await page.getByRole('button', { name: 'Restructure into outline' }).click();
  await page.getByRole('dialog', { name: 'Replace the outline?' }).getByRole('button', { name: 'Structure the notes' }).click();
  await expect(page.locator('.notes-panel .task-line')).toBeVisible();
  await caretToEnd(notes);
  await page.keyboard.type('\n- Added while Kiro was working (test input).');
  const stale = page.getByRole('dialog', { name: 'The notes or outline changed while Kiro was working' });
  await expect(stale).toBeVisible({ timeout: 150_000 });
  await shot(page, 'real-7-structure-race-1440');
  await stale.getByRole('button', { name: 'Cancel' }).click();
  expect(await page.locator('.outline-item .item-heading').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(headingsBefore);
  expect(await page.locator('.outline-item .item-brief').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))).toEqual(outlineBefore);
  await expect(page.getByText('Notes changed since the outline was made.')).toBeVisible();

  // ---- 7. Reload keeps real results ----
  const finalValues = await values(page);
  const finalCandle = await expectCandleMatchesPage(page);
  await page.waitForTimeout(900); // debounced save
  await page.reload();
  expect(await values(page)).toEqual(finalValues);
  await expect(page.locator('#notes-text')).toHaveValue(/Added while Kiro was working/);
  expect(await page.locator('.outline-item .item-heading').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(headingsBefore);
  const rowAfter = para(page, 'TEST PARAGRAPH (written');
  await expect(rowAfter.getByText('1 settled concern')).toBeVisible();
  await expect(rowAfter.getByText(/edited this paragraph after the ghosts read it/)).toHaveCount(0);
  const reloaded = await expectCandleMatchesPage(page);
  expect(reloaded.words).toBe(finalCandle.words);
  await shot(page, 'real-8-after-reload-1440');

  // ---- no process left behind by any of the above, cancelled or finished ----
  await expect.poll(() => count('haunted-ink-editor'), { timeout: 20_000 }).toBe(0);
});
