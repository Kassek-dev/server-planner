import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/** Stage 20: reverse proxy routes, local DNS, cable label pattern and schema v1 → v2 import. */

const fixtures = join(import.meta.dirname, '../../../fixtures/schema');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

async function open(page: Page, file: string) {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(join(fixtures, file));
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}

test('a project from version 1.1 is upgraded on import', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(join(fixtures, 'v1/home-lab.json'));
  await expect(
    page.getByText('The file used schema version 1 and was upgraded to version 3.'),
  ).toBeVisible();
});

test('proxy routes and DNS records in the Proxy & DNS drawer', async ({ page }) => {
  await open(page, 'v2/reverse-proxy.json');
  await inspector(page).getByRole('button', { name: 'Proxy & DNS' }).click();
  const drawer = page.getByRole('dialog', { name: 'Proxy & DNS' });
  await expect(drawer.getByText('1 reverse proxy route')).toBeVisible();
  await expect(drawer.getByLabel('Host name')).toHaveValue('jellyfin.home.arpa');
  await expect(drawer.getByText('3 local DNS records')).toBeVisible();

  await drawer.getByRole('button', { name: 'Add record' }).click();
  await expect(drawer.getByText('4 local DNS records')).toBeVisible();
  const name = drawer.getByLabel('Name').last();
  await name.fill('printer.home.arpa');
  await name.press('Enter');
  await expect(name).toHaveValue('printer.home.arpa');

  // A name taken by a CNAME is rejected with a readable message.
  await name.fill('media.home.arpa');
  await name.press('Enter');
  await expect(drawer.getByText(/media.home.arpa already has a record/)).toBeVisible();
  await page.screenshot({ path: 'test-results/proxy-dns-drawer.png' });
});

test('access view lists host names behind a forwarded proxy', async ({ page }) => {
  await open(page, 'v2/reverse-proxy.json');
  await page.getByRole('link', { name: 'Access' }).click();
  const proxied = page.getByRole('list', { name: 'Host names behind this reverse proxy' });
  await expect(proxied.getByText('jellyfin.home.arpa')).toBeVisible();
  await expect(proxied.getByText('→ Jellyfin:8096')).toBeVisible();
});

test('the project cable label pattern is used for generated labels', async ({ page }) => {
  await open(page, 'v2/reverse-proxy.json');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Search elements and actions' });
  await search.fill('label all');
  await search.press('Enter');
  await page.locator('.react-flow__edge').first().click({ force: true });
  await expect(inspector(page).getByLabel('Label')).toHaveValue(/^[A-Z0-9-]+:[A-Z0-9.]+ - /);
});
