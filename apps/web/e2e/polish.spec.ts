import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json');

async function openExample(page: Page) {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}
const node = (page: Page, name: string) =>
  page.locator('.react-flow__node', { has: page.getByText(name, { exact: true }) }).first();

test('deleting shows a toast whose Undo restores the device (UI3)', async ({ page }) => {
  await openExample(page);
  await node(page, 'nas-01').click();
  await page.keyboard.press('Delete');
  const toast = page.getByRole('status').filter({ hasText: 'Deleted nas-01' });
  await expect(toast).toBeVisible();
  await expect(node(page, 'nas-01')).toHaveCount(0);
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(node(page, 'nas-01')).toBeVisible();
  await expect(page.getByText('Deleted nas-01')).toBeHidden();
});

test('the first router brings the Internet node (UI2)', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await page
    .getByRole('complementary', { name: 'Library' })
    .getByRole('button', { name: /^Router/ })
    .click();
  await expect(page.getByText('Internet added and connected to router-1 WAN')).toBeVisible();
  await expect(page.locator('.react-flow__node', { hasText: 'INTERNET' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.locator('.react-flow__node', { hasText: 'INTERNET' })).toHaveCount(0);
  await expect(node(page, 'router-1')).toBeVisible();
});

test('settings: theme and storage, delete all data', async ({ page }) => {
  await openExample(page);
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await page.getByText('Light', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('link', { name: 'Storage' }).click();
  await expect(page.getByText('1 project · last export: never', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Delete all data' }).click();
  await page
    .getByRole('dialog', { name: 'Delete all data?' })
    .getByRole('button', { name: 'Delete all data' })
    .click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Plan your home lab' })).toBeVisible();
});

test('about: data sources and generated license list', async ({ page }) => {
  await page.goto('./#/about');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Data sources' }).click();
  await expect(page.getByRole('link', { name: 'Curated layer (this project)' })).toBeVisible();
  await page.getByRole('link', { name: 'Licenses' }).click();
  await expect(page.getByRole('link', { name: 'react', exact: true })).toBeVisible();
});
