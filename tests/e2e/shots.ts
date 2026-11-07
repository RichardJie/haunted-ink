import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';

const dir = resolve(process.env.HAUNTED_INK_WORK_DIR ?? join(process.cwd(), '../../work'), 'screens');
mkdirSync(dir, { recursive: true });
// HAUNTED_INK_SHOT_PREFIX (for example "final-") keeps a review set apart from earlier screenshots.
const prefix = process.env.HAUNTED_INK_SHOT_PREFIX ?? '';
export const shot = (page: Page, name: string) => page.screenshot({ path: join(dir, `${prefix}${name}.png`), fullPage: false });
