import { expect, type Page } from '@playwright/test';
import { bodyWords, candleProgress } from '../../shared/editorial.ts';

const candle = (page: Page) => page.getByRole('progressbar', { name: 'Words written toward the goal' });

/** Body words as the candle should count them, read from the paragraphs actually on the page. */
export async function pageWords(page: Page): Promise<number> {
  const texts = await page.locator('.block textarea').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  return bodyWords(texts.map((text, i) => ({ id: String(i), text })));
}

/** Painted height of the wax body after its 700 ms transition has settled. */
export async function waxHeight(page: Page): Promise<number> {
  await page.waitForTimeout(900);
  return page.locator('.wax-body').evaluate((el) => el.getBoundingClientRect().height);
}

/** The candle shows exactly the body words on the page, and its wax equals the documented formula for them. */
export async function expectCandleMatchesPage(page: Page): Promise<{ words: number; height: number }> {
  const words = await pageWords(page);
  const goal = Number(await candle(page).getAttribute('aria-valuemax'));
  await expect(candle(page)).toHaveAttribute('aria-valuenow', String(Math.min(words, goal)));
  await expect(page.locator('.candle-art')).toHaveAttribute('data-wax', candleProgress(words, goal).wax.toFixed(3));
  return { words, height: await waxHeight(page) };
}
