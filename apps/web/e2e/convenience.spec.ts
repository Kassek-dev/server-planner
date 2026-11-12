import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/** Stage 16a: templates, command palette, minimap, notes, cable labels, second tab warning. */

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const library = (page: Page) => page.getByRole('complementary', { name: 'Library' });

async function openExample(page: Page) {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}

test('new project from the IoT segmentation template', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByText('IoT segmentation', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('.react-flow__node', { hasText: 'router' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Access' }).click();
  await expect(
    page.getByRole('region', { name: 'Access' }).getByRole('columnheader', { name: 'Guest' }),
  ).toBeVisible();
});

test('command palette finds a device and runs actions', async ({ page }) => {
  await openExample(page);
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Search elements and actions' });
  await search.fill('nas');
  await search.press('Enter');
  await expect(inspector(page).getByRole('heading', { name: 'nas-01' })).toBeVisible();

  await page.keyboard.press('Control+k');
  await search.fill('label all');
  await search.press('Enter');
  await page.locator('.react-flow__edge').first().click({ force: true });
  await expect(inspector(page).getByLabel('Label')).toHaveValue(/ ↔ /);
});

test('minimap, notes and a second tab', async ({ page, context }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Minimap' }).click();
  await expect(page.getByLabel('Canvas overview')).toBeVisible();

  await library(page).getByRole('button', { name: /^Note/ }).click();
  const note = page.getByRole('button', { name: 'Note: empty' });
  await note.dblclick();
  const text = page.getByRole('textbox', { name: 'Edit note' });
  await text.fill('Buy a UPS before winter');
  await text.press('Control+Enter');
  await expect(page.getByRole('button', { name: 'Note: Buy a UPS before winter' })).toBeVisible();
  await page.screenshot({ path: 'test-results/notes-minimap.png' });

  const url = page.url();
  const second = await context.newPage();
  await second.goto(url);
  await expect(second.getByText(/This project is also open in another tab/)).toBeVisible();
  await expect(page.getByText(/This project is also open in another tab/)).toBeVisible();
  await second.close();
  await expect(page.getByText(/This project is also open in another tab/)).toBeHidden();
});
