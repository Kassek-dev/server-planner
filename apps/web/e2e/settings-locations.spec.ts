import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/** Stage 21: defaults for new projects (SET-02), location inspector (LOC-06), spec filters (LIB-02). */

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v3/home-lab.json');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

async function openExample(page: Page) {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}

test('new projects start with the defaults from Settings › Units & costs', async ({ page }) => {
  await page.goto('./#/settings/units');
  const currency = page.getByLabel('Currency');
  await expect(currency).toHaveValue('EUR');
  await currency.fill('PLN');
  await currency.press('Enter');
  const reserve = page.getByLabel(/Storage reserve/);
  await reserve.fill('20');
  await reserve.press('Enter');

  await page.goto('./');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Project name').fill('Defaults lab');
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await inspector(page).getByRole('button', { name: 'Project settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Project settings' });
  await expect(settings.getByLabel('Currency')).toHaveValue('PLN');
  await expect(settings.getByLabel(/Storage reserve/)).toHaveValue('20');
});

test('a rack shows occupied units, power and its devices', async ({ page }) => {
  await openExample(page);
  await page
    .locator('.react-flow__node', { hasText: 'Closet rack' })
    .first()
    .click({
      position: { x: 40, y: 10 },
    });
  const panel = inspector(page);
  await expect(panel.getByText('5 of 12 U occupied')).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Power' })).toBeVisible();
  await panel.getByRole('button', { name: /nas-01/ }).click();
  await expect(panel.getByRole('heading', { name: 'nas-01' })).toBeVisible();
});

test('the device model picker filters by specification', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Browse device models' }).click();
  const picker = page.getByRole('dialog', { name: 'Browse device models' });
  const status = picker.getByRole('status');
  const all = Number((await status.textContent())?.match(/\d+/)?.[0]);
  await picker.getByLabel('CPU architecture').selectOption('arm64');
  await expect(status).not.toHaveText(new RegExp(`^${all} models`));
  const arm = Number((await status.textContent())?.match(/\d+/)?.[0]);
  expect(arm).toBeGreaterThan(0);
  expect(arm).toBeLessThan(all);
  await picker.getByLabel('CPU architecture').selectOption('');
  await expect(status).toHaveText(new RegExp(`^${all} models`));
});
