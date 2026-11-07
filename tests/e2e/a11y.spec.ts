import { expect, test } from '@playwright/test';
import { shot } from './shots.ts';

async function loadExample(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load the example' }).click();
  await expect(page.getByRole('textbox', { name: 'Paragraph 3', exact: true })).toBeVisible();
  // Clicking the empty-state button scrolled it into view; start the checks from the top.
  await page.evaluate(() => window.scrollTo(0, 0));
}

test('keyboard-only: reach actions, open and close the revision sheet, focus is trapped and restored', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loadExample(page);
  // Tab to the first Revise button using only the keyboard.
  const revise = page.getByRole('button', { name: /Revise paragraph 3 with Kiro/ });
  await page.getByRole('textbox', { name: 'Paragraph 3', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(revise).toBeFocused();
  const outline = await revise.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Revise with Kiro' });
  await expect(sheet).toBeVisible();
  // Focus stays inside the sheet through a full Tab cycle.
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(revise).toBeFocused();
});

test('375 px viewport: no horizontal scroll, full-width sheet, 40 px touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await loadExample(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const name of ['Import', 'Example', 'Export', 'References 6']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
  }
  // The compact masthead (brand, Kiro readiness, four actions) stays under a sixth of the first screen.
  const head = await page.locator('.masthead').boundingBox();
  expect(head!.height).toBeLessThanOrEqual(130);
  await expect(page.locator('.masthead').getByText('Kiro CLI ready')).toBeInViewport();
  await shot(page, 'mobile-1-example');
  await page.getByRole('button', { name: /Revise paragraph 3 with Kiro/ }).click();
  const box = await page.getByRole('dialog', { name: 'Revise with Kiro' }).boundingBox();
  expect(Math.round(box!.width)).toBe(375);
  await shot(page, 'mobile-2-sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^References/ }).click();
  const drawer = page.getByRole('dialog', { name: 'References' });
  expect(Math.round((await drawer.boundingBox())!.width)).toBe(375);
  await page.waitForTimeout(400);
  await shot(page, 'mobile-3-ledger');
});

test('reduced motion removes transitions and animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await loadExample(page);
  const d = await page.locator('.block-tools').first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(d).toBe('0s');
});

test('the page makes no requests to hosts other than the app origin', async ({ page }) => {
  const hosts = new Set<string>();
  page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol.startsWith('http')) hosts.add(u.host); });
  await page.setViewportSize({ width: 1280, height: 800 });
  await loadExample(page);
  expect([...hosts]).toEqual(['127.0.0.1:4318']);
});
