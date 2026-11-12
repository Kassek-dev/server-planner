import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/** Stage 16b: snapshots with diff and restore, own device templates, cable routing. */

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const library = (page: Page) => page.getByRole('complementary', { name: 'Library' });
const node = (page: Page, name: string) =>
  page.locator('.react-flow__node', { has: page.getByText(name, { exact: true }) }).first();

async function openExample(page: Page) {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}

test('snapshot, change, diff and restore', async ({ page }) => {
  await openExample(page);
  await inspector(page).getByRole('button', { name: 'Snapshots' }).click();
  const view = page.getByRole('region', { name: 'Snapshots' });
  await view.getByRole('button', { name: 'Create snapshot' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create snapshot' });
  await dialog.getByLabel('Name').fill('Before cleanup');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(view.getByText('No differences.')).toBeVisible();

  // Delete a device on the canvas, then compare.
  await page.getByRole('link', { name: 'Topology' }).click();
  await node(page, 'tv-salon').click();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search elements and actions' }).fill('snapshots');
  await page.keyboard.press('Enter');
  await expect(view.getByText('+0 added · −2 removed · ~0 changed')).toBeVisible();
  await expect(view.getByText('tv-salon', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/snapshots.png' });

  await view.getByRole('button', { name: 'Restore “Before cleanup”' }).click();
  await expect(view.getByText('No differences.')).toBeVisible();
  await expect(view.getByRole('button', { name: /^Before restoring/ })).toBeVisible();
});

test('own device template and straight cable', async ({ page }) => {
  await openExample(page);
  await node(page, 'pve1').click();
  const panel = inspector(page);
  await panel.getByRole('tab', { name: 'Hardware' }).click();
  await panel.getByRole('button', { name: 'Save as template' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save as template' });
  await dialog.getByLabel('Template name').fill('Proxmox box');
  await dialog.getByRole('button', { name: 'Save template' }).click();

  await library(page).getByRole('button', { name: 'Proxmox box', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'proxmox-box-1' })).toBeVisible();

  await page.locator('.react-flow__edge').first().click({ force: true });
  await panel.getByText('Straight', { exact: true }).click();
  await expect(page.locator('.react-flow__edge').first()).toBeVisible();
});
