import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectCandleMatchesPage } from './candle.ts';
import { shot } from './shots.ts';

// Real browser, real server, real doi.org, one real Kiro revision. No mocks.
test('import, example, check DOIs, revise with Kiro, apply, undo, reload, export', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  // Fresh start is normal: no restore notice.
  await expect(page.getByRole('heading', { name: 'The page is blank' })).toBeVisible();
  await expect(page.getByText('could not be restored')).toHaveCount(0);
  await expect(page.getByText(/Kiro CLI ready/)).toBeVisible();
  await shot(page, 'desktop-1-empty');

  // Import: wrong type is refused, a text file is accepted.
  const dir = mkdtempSync(join(tmpdir(), 'hi-e2e-'));
  writeFileSync(join(dir, 'bad.pdf'), 'x');
  writeFileSync(join(dir, 'note.txt'), '# My Note\n\nA first paragraph about 3 things.\n\nA second paragraph.');
  await page.locator('input[type=file]').setInputFiles(join(dir, 'bad.pdf'));
  await expect(page.getByText('Only .md, .markdown and .txt files can be imported')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(join(dir, 'note.txt'));
  await expect(page.getByRole('textbox', { name: 'Paragraph 2', exact: true })).toHaveValue('A first paragraph about 3 things.');

  // Loading the example needs confirmation because the manuscript is not empty.
  await page.getByRole('button', { name: 'Example', exact: true }).click();
  await page.getByRole('dialog', { name: 'Replace the manuscript?' }).getByRole('button', { name: 'Load the example' }).click();
  // References live in an auxiliary drawer.
  await page.getByRole('button', { name: /^References/ }).click();
  await expect(page.getByRole('heading', { name: 'Reference ledger' })).toBeVisible();

  // Example references start unchecked (no stored verdicts).
  await expect(page.locator('.ledger .status-unchecked')).toHaveCount(5);
  await expect(page.locator('.ledger .status-no_doi')).toHaveCount(1);
  await expect(page.locator('.ledger .status-verified')).toHaveCount(0);
  await shot(page, 'desktop-2-example-unchecked');

  // Real DOI checks.
  await page.getByRole('button', { name: /^Check all/ }).click();
  await expect(page.locator('.ledger .status-checking').first()).toBeVisible();
  await expect(page.locator('.ledger .status-verified')).toHaveCount(3, { timeout: 60_000 });
  await expect(page.locator('.ledger .status-mismatch')).toHaveCount(1);
  await expect(page.locator('.ledger .status-not_found')).toHaveCount(1);
  await expect(page.locator('.ledger .status-no_doi')).toHaveCount(1);
  await expect(page.locator('.ledger .status-verified .glyph').first()).toHaveText('✓');
  // The example notice must never contradict completed checks.
  await expect(page.locator('.flash')).not.toContainText('Unchecked');
  await expect(page.locator('.ledger').getByText(/does not mean the source supports the sentence/).first()).toBeVisible();
  await expect(page.locator('.cite-not_found')).toHaveCount(1);
  await expect(page.locator('.cite-mismatch')).toHaveCount(1);
  await expect(page.getByText('phantom reference', { exact: false }).first()).toBeVisible();
  const hochreiter = page.locator('li.ref', { hasText: 'hochreiter1997' });
  await hochreiter.getByRole('button', { name: 'Details' }).click();
  await expect(hochreiter.locator('tr.differs')).toContainText('1998');
  await expect(hochreiter.locator('tr.differs')).toContainText('1997');
  // Ledger summary is plain counts of the current statuses; intentional example problems are tagged.
  await expect(page.getByLabel('Ledger summary: 6 references, 1 Not found, 1 Mismatch, 3 Verified, 1 No DOI')).toBeVisible();
  await expect(page.locator('.ledger .intent-tag')).toHaveText(['Intentional example problem', 'Intentional example', 'Intentional example problem']);
  await expect(page.locator('li.ref', { hasText: 'lecun2015' })).not.toContainText('Expected: Verified');
  await expect(hochreiter.locator('.detail')).toContainText('Intentional example problem: the year is entered as 1998 on purpose');
  await shot(page, 'desktop-3-checked');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'References' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^References/ })).toContainText('2 to fix');
  await page.locator('.cite-not_found').scrollIntoViewIfNeeded();
  await expect(page.locator('.note-not_found')).toContainText('Not found. phantom2026 is a phantom reference.');
  await shot(page, 'desktop-3b-phantom');

  const candleBefore = await expectCandleMatchesPage(page);

  // Revise one paragraph with the real local Kiro CLI.
  const block = page.locator('.block', { hasText: 'Recurrent networks pass a hidden state' });
  const textarea = block.locator('textarea');
  const original = await textarea.inputValue();
  await block.getByRole('button', { name: /Revise paragraph \d+ with Kiro/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Revise with Kiro' });
  await sheet.getByLabel('Tighten').check();
  await expect(sheet.getByLabel(/Intent/)).toHaveValue(/Tighten the prose/);
  await sheet.getByLabel(/Intent/).press('Control+Enter');
  await expect(sheet.getByText(/Queued|Kiro is revising/)).toBeVisible();
  await shot(page, 'desktop-4-revising');
  await expect(sheet.getByRole('heading', { name: 'Comparison' })).toBeVisible({ timeout: 150_000 });
  await expect(sheet.locator('ins, del').first()).toBeVisible();
  await shot(page, 'desktop-5-diff');
  await expect(textarea).toHaveValue(original); // nothing changed until Apply

  // Editing the paragraph after the request blocks Apply; restoring the text unblocks it.
  await textarea.click();
  await textarea.press('Control+End');
  await textarea.pressSequentially(' extra');
  await expect(sheet.getByText(/changed after the request was sent/)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Apply' })).toBeDisabled();
  for (let i = 0; i < ' extra'.length; i++) await textarea.press('Backspace');
  await expect(textarea).toHaveValue(original);
  const apply = sheet.getByRole('button', { name: 'Apply' });
  const ack = sheet.getByLabel(/I have checked these/);
  if (await ack.count()) await ack.check();
  await apply.click();
  await expect(sheet).toHaveCount(0);
  await expect(block.getByText('Revision applied')).toBeVisible();
  const revised = await textarea.inputValue();
  expect(revised).not.toBe(original);
  expect(revised).toContain('[@hochreiter1997]');
  const candleApplied = await expectCandleMatchesPage(page); // follows the applied text
  if (candleApplied.words !== candleBefore.words) expect(candleApplied.height > candleBefore.height).toBe(candleApplied.words < candleBefore.words);

  // Undo restores the exact original; reload keeps everything.
  await block.getByRole('button', { name: 'Undo' }).click();
  await expect(textarea).toHaveValue(original);
  expect((await expectCandleMatchesPage(page)).words).toBe(candleBefore.words); // and returns on Undo
  await page.reload();
  expect((await expectCandleMatchesPage(page)).words).toBe(candleBefore.words); // and survives a reload
  await expect(page.getByLabel(/Paragraph \d+/).filter({ hasText: '' }).first()).toBeVisible();
  await page.getByRole('button', { name: /^References/ }).click();
  await expect(page.locator('.ledger .status-verified')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(page.locator('.block textarea', { hasText: '' }).nth(0)).toBeVisible();
  await expect(page.locator('.block', { hasText: 'Recurrent networks pass a hidden state' }).locator('textarea')).toHaveValue(original);

  // Exports.
  const names: Record<string, string> = {};
  for (const item of ['Manuscript (Markdown)', 'References (BibTeX)', 'References (CSL-JSON)', 'Citation report (Markdown)']) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: item }).click()]);
    const path = await dl.path();
    names[item] = dl.suggestedFilename();
    const text = readFileSync(path, 'utf8');
    expect(dl.suggestedFilename()).toMatch(/^remembering-long-contexts-a-short-note-on-sequence-models(-references|-citation-report)?-\d{4}-\d{2}-\d{2}\.(md|bib|json)$/);
    if (item.startsWith('Manuscript')) expect(text).toContain('## References');
    if (item.includes('BibTeX')) expect(text).toContain('@misc{lecun2015,');
    if (item.includes('CSL')) expect(JSON.parse(text)[0].DOI).toBe('10.1038/nature14539');
    if (item.includes('report')) {
      expect(text).toContain('does not mean the source supports the sentence');
      expect(text).toContain('Status: Not found');
      expect(text).toContain('Status: Mismatch');
    }
  }

  // Corrupt saved data is explained, not fatal.
  // (Set before the page scripts run, because leaving the page would otherwise save the live state over it.)
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('corrupted')) { sessionStorage.setItem('corrupted', '1'); localStorage.setItem('haunted-ink:v3', '{broken'); }
  });
  await page.reload();
  await expect(page.getByText(/Saved work could not be restored/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The page is blank' })).toBeVisible();
});
