import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/** Stage 15: expected use from load profiles, storage growth and GPUs (SW-08/09, CAP-05/06, HW-05). */

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const node = (page: Page, name: string) =>
  page.locator('.react-flow__node', { has: page.getByText(name, { exact: true }) }).first();

async function openExample(page: Page) {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}

test('load profile drives the expected capacity of the host', async ({ page }) => {
  await openExample(page);
  const panel = inspector(page);
  await node(page, 'pve1').click();
  await panel.getByRole('tab', { name: 'Capacity' }).click();
  await panel.getByRole('button', { name: 'docker-vm' }).first().click();
  await expect(panel.getByRole('heading', { name: 'docker-vm' })).toBeVisible();

  await panel.getByRole('button', { name: 'Add app from catalog' }).click();
  const catalog = page.getByRole('dialog', { name: 'App catalog' });
  await catalog.getByRole('searchbox', { name: 'Search apps' }).fill('jellyfin');
  await catalog.getByRole('checkbox', { name: 'Select Jellyfin' }).check();
  await catalog.getByRole('button', { name: 'Configure…' }).click();
  await page
    .getByRole('dialog', { name: 'Add app · Jellyfin' })
    .getByRole('button', { name: 'Add Jellyfin' })
    .click();
  await expect(panel.getByRole('heading', { name: 'Jellyfin' })).toBeVisible();

  await expect(panel.getByRole('combobox', { name: 'Profile' })).toHaveValue('typical');
  const transcodes = panel.getByLabel('Simultaneous transcodes (CPU)');
  await transcodes.fill('3');
  await transcodes.press('Enter');

  await node(page, 'pve1').click();
  await panel.getByRole('tab', { name: 'Capacity' }).click();
  await panel.getByText('Expected', { exact: true }).click();
  await expect(panel.getByText(/^Expected use: apps at their load profile/)).toBeVisible();
  // docker-vm: 2 vCPU allocated, Jellyfin expects 0.5 + 0.2 + 3 × 2 → capped at the VM's 2.
  await expect(panel.getByRole('meter', { name: /^CPU \d+%$/ })).toBeVisible();
  await panel.getByText('Allocated', { exact: true }).click();
  await expect(panel.getByText(/^Overcommit: CPU/)).toBeVisible();
});

test('volume growth forecast and a GPU on the host', async ({ page }) => {
  await openExample(page);
  const panel = inspector(page);
  await node(page, 'pve1').click();
  await panel.getByRole('tab', { name: 'Hardware' }).click();
  await panel.getByRole('button', { name: 'Add GPU' }).click();
  await expect(panel.getByRole('checkbox', { name: 'QuickSync' })).toBeChecked();

  await panel.getByRole('tab', { name: 'Capacity' }).click();
  await panel.getByRole('button', { name: 'docker-vm' }).first().click();
  await panel.getByRole('button', { name: 'jellyfin' }).first().click();
  await expect(panel.getByRole('heading', { name: 'jellyfin' })).toBeVisible();
  const growth = panel.getByLabel('Growth / month').first();
  await growth.fill('20 GB');
  await growth.press('Enter');

  await node(page, 'pve1').click();
  await panel.getByRole('tab', { name: 'Capacity' }).click();
  await expect(panel.getByText(/^Grows 20 GB\/month — full in about \d+ months?\.$/)).toBeVisible();
});
