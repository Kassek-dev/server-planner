import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json');

test('create, rename with undo, autosave, export, delete', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('Garage lab');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await expect(page).toHaveURL(/#\/p\/prj_/);
  await page.getByRole('button', { name: 'Garage lab' }).click();
  await page.getByLabel('Rename project').fill('Garage lab v2');
  await page.getByLabel('Rename project').press('Enter');
  await expect(page.getByRole('button', { name: 'Garage lab v2' })).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Garage lab', exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.getByRole('button', { name: 'Garage lab v2' })).toBeVisible();
  // Exact match: "Unsaved changes" also contains "saved".
  await expect(page.getByRole('status').getByText('Saved', { exact: true })).toBeVisible({
    timeout: 5000,
  });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Garage lab v2' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export' }).getByText('JSON', { exact: true }).click();
  await page.getByRole('button', { name: 'Export JSON' }).click();
  expect((await download).suggestedFilename()).toMatch(/^garage-lab-v2-\d{4}-\d{2}-\d{2}\.json$/);

  await page.getByRole('link', { name: 'Server Planner' }).click();
  await page.getByRole('button', { name: 'Actions for Garage lab v2' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete project' }).click();
  await expect(page.getByRole('heading', { name: 'Plan your home lab' })).toBeVisible();
});

test('import the example file, then import it again as a copy', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  const dialog = page.getByRole('dialog', { name: 'Import project' });
  await expect(dialog.getByText('Imported “Home lab” with 7 devices.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).first().click();

  await page.getByTestId('import-input').setInputFiles(fixture);
  await expect(page.getByText('imported as a copy')).toBeVisible();
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.getByRole('button', { name: 'Home lab' })).toBeVisible();
  await expect(page.getByText('This project')).toBeVisible();
});

test('rejects files that are not projects', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
  });
  await expect(page.getByText('The file is not a Server Planner project.')).toBeVisible();
});
