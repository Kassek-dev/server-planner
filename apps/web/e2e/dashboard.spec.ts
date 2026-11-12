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
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

async function commit(page: Page, label: string, value: string) {
  const field = inspector(page).getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press('Enter');
}

test('dashboard: power, PoE budget and bill of materials', async ({ page }) => {
  await openExample(page);

  // nas-01: power figures and a planned purchase.
  await node(page, 'nas-01').click();
  await inspector(page).getByRole('tab', { name: 'Hardware' }).click();
  await commit(page, 'Idle W', '20');
  await commit(page, 'Load W', '40');
  await inspector(page).getByLabel('Status').selectOption('to-buy');
  await commit(page, 'Price (EUR)', '450');

  // sw-core powers the AP over PoE with a too small budget.
  await node(page, 'sw-core').click();
  await inspector(page).getByRole('tab', { name: 'Hardware' }).click();
  await commit(page, 'PoE budget W', '15');
  await inspector(page).getByRole('tab', { name: 'Network' }).click();
  const port = inspector(page).getByRole('group', { name: 'Port 8' });
  await port.getByLabel('PoE', { exact: true }).selectOption('pse');

  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const view = page.getByRole('region', { name: 'Dashboard' });
  const energy = view.getByRole('article', { name: 'Energy (estimate)' });
  // nas-01 idles at 20 W, the AP draws 25.5 W over PoE.
  await expect(energy).toContainText('Idle46 W');
  await expect(view.getByRole('article', { name: 'Bill of materials' })).toContainText('€450.00');
  const budgets = view.getByRole('article', { name: 'PoE and UPS' });
  await expect(budgets).toContainText('PoE · sw-core');
  await expect(budgets).toContainText('25.5 / 15 W');
  await expect(view.getByRole('article', { name: 'Issues' })).toContainText('Errors');
  await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });

  await energy.getByRole('button', { name: 'Set the energy price to see the cost' }).click();
  await expect(page.getByRole('dialog', { name: 'Project settings' })).toBeVisible();
});
