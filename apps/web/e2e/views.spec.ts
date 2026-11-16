import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v2/home-lab.json');

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

test('exports from any view: CSV, Markdown and docker-compose (EXP-03…06)', async ({ page }) => {
  await openExample(page);
  await page.getByRole('link', { name: 'Inventory' }).click();
  const open = async () => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    return page.getByRole('dialog', { name: 'Export' });
  };

  let dialog = await open();
  await dialog.getByText('PNG', { exact: true }).click();
  await expect(dialog.getByText('switch to Topology', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Export PNG' })).toBeDisabled();

  await dialog.getByText('CSV', { exact: true }).click();
  await dialog.getByText('IP plan', { exact: true }).click();
  let download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export CSV' }).click();
  let file = await download;
  expect(file.suggestedFilename()).toMatch(/^home-lab-.*-ip\.csv$/);
  expect(await readFile(await file.path(), 'utf8')).toContain('192.168.20.15,nas-01');

  dialog = await open();
  await dialog.getByText('Markdown', { exact: true }).click();
  download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export Markdown' }).click();
  file = await download;
  expect(await readFile(await file.path(), 'utf8')).toContain('## Firewall · gw-01');

  dialog = await open();
  await dialog.getByText('Compose', { exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Containers of' })).toHaveValue(
    /^host:workload:/,
  );
  download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export Compose' }).click();
  file = await download;
  expect(file.suggestedFilename()).toBe('docker-vm-docker-compose.yml');
  expect(await readFile(await file.path(), 'utf8')).toContain(
    'image: "lscr.io/linuxserver/jellyfin:latest"',
  );

  dialog = await open();
  await dialog.getByText('Network', { exact: true }).click();
  await page.screenshot({ path: 'test-results/export-network.png' });
  const target = dialog.getByRole('combobox', { name: 'Host or list' });
  await expect(target.locator('option')).toHaveText([
    'pve1 · /etc/network/interfaces',
    'DHCP reservations (dnsmasq)',
  ]);
  download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export Network' }).click();
  file = await download;
  expect(file.suggestedFilename()).toBe('pve1-interfaces');
  expect(await readFile(await file.path(), 'utf8')).toContain('    bridge-ports eth0');
});

test('services map: apps behind proxy routes and local names (VIEW-07)', async ({ page }) => {
  await page.goto('./');
  await page
    .getByTestId('import-input')
    .setInputFiles(join(import.meta.dirname, '../../../fixtures/schema/v2/reverse-proxy.json'));
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.getByRole('link', { name: 'Services' }).click();
  await expect(page).toHaveURL(/\/services/);
  const map = page.getByRole('list', { name: 'Services map' });
  await expect(map.getByRole('button', { name: /^Host name jellyfin\.home\.arpa/ })).toBeVisible();
  const caddy = map.getByRole('button', { name: /^Caddy on .*Leads to Jellyfin/ });
  await expect(caddy).toBeVisible();
  await map.getByRole('button', { name: /^Jellyfin on / }).click();
  await expect(inspector(page).getByRole('textbox', { name: 'Name' })).toHaveValue('Jellyfin');
  await page.screenshot({ path: 'test-results/services-map.png' });
  await map.getByRole('button', { name: /^Host name media\.home\.arpa/ }).click();
  await expect(page).toHaveURL(/panel=services/);
});
