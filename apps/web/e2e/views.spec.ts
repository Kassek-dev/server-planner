import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json');

async function openExample(page: Page) {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

test('inventory: search, sort, inline rename and location, selection opens the inspector', async ({
  page,
}) => {
  await openExample(page);
  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(page).toHaveURL(/\/inventory/);
  const table = page.getByRole('table', { name: 'Devices · 7' });
  await expect(table.getByRole('columnheader', { name: 'Closet rack' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search inventory' }).fill('proxmox');
  await expect(table.getByRole('textbox')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search inventory' }).fill('');

  const name = table.getByRole('textbox', { name: 'Name of nas-01' });
  await name.click();
  await expect(inspector(page).getByRole('heading', { name: 'nas-01' })).toBeVisible();
  await name.fill('nas-02');
  await name.press('Enter');
  await expect(table.getByRole('textbox', { name: 'Name of nas-02' })).toBeVisible();

  await table
    .getByRole('combobox', { name: 'Location of tv-salon' })
    .selectOption({ label: 'Office shelf' });
  await expect(table.getByRole('combobox', { name: 'Location of tv-salon' })).toHaveValue(/loc_/);
  await page.keyboard.press('Control+Z');

  await page.getByRole('radio', { name: 'Workloads · 4' }).check({ force: true });
  const workloads = page.getByRole('table', { name: 'Workloads · 4' });
  await workloads.getByRole('button', { name: 'vCPU' }).click();
  await expect(workloads.getByRole('columnheader', { name: 'vCPU' })).toHaveAttribute(
    'aria-sort',
    /ascending|descending/,
  );
  await workloads.getByRole('textbox', { name: 'Name of docker-vm' }).click();
  await expect(inspector(page).getByRole('heading', { name: 'docker-vm' })).toBeVisible();

  // Back to the canvas keeps the selection.
  await page.getByRole('link', { name: 'Topology' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await expect(inspector(page).getByRole('heading', { name: 'docker-vm' })).toBeVisible();
});

test('IP plan: subnets, conflicts, DHCP pool and free ranges', async ({ page }) => {
  await openExample(page);
  await page.getByRole('link', { name: 'IP Plan' }).click();
  const lan = page.getByRole('article', { name: '192.168.20.0/24' });
  await expect(lan.getByText('2 conflicts')).toBeVisible();
  await expect(lan.getByText('Assigned more than once')).toHaveCount(2);
  await expect(
    lan.getByText('192.168.20.100 – 192.168.20.199 · DHCP pool (100 addresses)'),
  ).toBeVisible();
  await expect(lan.getByText('192.168.20.3 – 192.168.20.14 · free (12 addresses)')).toBeVisible();
  await lan.getByRole('button', { name: 'docker-vm' }).click();
  await expect(inspector(page).getByRole('heading', { name: 'docker-vm' })).toBeVisible();
});
