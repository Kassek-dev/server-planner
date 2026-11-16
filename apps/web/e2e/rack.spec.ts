import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/** Stage 26: rack front view (LOC-09). */

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v2/home-lab.json');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

test('rack front view: drawing, SVG download and PNG download', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await page
    .locator('.react-flow__node', { hasText: 'Closet rack' })
    .first()
    .click({ position: { x: 40, y: 10 } });
  await inspector(page).getByRole('button', { name: 'Front view' }).click();
  const dialog = page.getByRole('dialog', { name: 'Closet rack — front view' });
  await expect(dialog.getByText('7 of 12 U free.', { exact: false })).toBeVisible();
  const drawing = dialog.getByRole('img', { name: 'Front view of Closet rack' });
  await expect(drawing).toBeVisible();
  await expect(drawing.getByText('nas-01')).toBeVisible();
  await expect(drawing.getByText('7U free')).toBeVisible();
  await page.screenshot({ path: 'test-results/rack-elevation.png' });

  let download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'SVG' }).click();
  let file = await download;
  expect(file.suggestedFilename()).toBe('closet-rack-elevation.svg');
  const svg = await readFile(await file.path(), 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('nas-01');
  expect(svg).not.toContain('var(--sp-');

  download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'PNG' }).click();
  file = await download;
  expect(file.suggestedFilename()).toBe('closet-rack-elevation.png');
  expect((await readFile(await file.path())).subarray(1, 4).toString()).toBe('PNG');
});
