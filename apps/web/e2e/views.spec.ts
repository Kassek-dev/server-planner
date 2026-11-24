import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v4/home-lab.json');

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
    .setInputFiles(join(import.meta.dirname, '../../../fixtures/schema/v4/reverse-proxy.json'));
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

test('print labels: cables and devices on an A4 sheet (LBL-04)', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Print labels' }).click();
  const dialog = page.getByRole('dialog', { name: 'Print labels' });
  await expect(dialog.getByText(/labels on 1 sheet/)).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Devices' }).uncheck();
  await dialog.getByRole('checkbox', { name: 'One label for each end' }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Cables' }).uncheck();
  await expect(dialog.getByText('Nothing to print: pick cables or devices.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Print/ })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Cables' }).check();
  await dialog
    .getByRole('combobox', { name: 'Label sheet' })
    .selectOption({ label: '38.1 × 21.2 mm · 5 × 13 (65 per sheet)' });
  await expect(dialog.getByRole('img', { name: 'Preview of the first sheet' })).toBeVisible();
  await page.screenshot({ path: 'test-results/labels.png' });
  // Printing shows the pages alone.
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.body.classList.add('sp-print-pages'));
  await expect(page.locator('[data-print-pages] svg').first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Print labels' })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
});

test('IPv6: dual-stack addressing in the inspector and the IP plan (NET-17)', async ({ page }) => {
  await page.goto('./');
  await page
    .getByTestId('import-input')
    .setInputFiles(join(import.meta.dirname, '../../../fixtures/schema/v4/dual-stack.json'));
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page
    .locator('.react-flow__node', { has: page.getByText('pi-dns', { exact: true }) })
    .first()
    .click();
  const panel = inspector(page);
  await panel.getByRole('tab', { name: 'Network' }).click();
  await expect(panel.getByLabel('IPv6').first()).toHaveValue('slaac');
  await page.screenshot({ path: 'test-results/ipv6-inspector.png' });

  await page.getByRole('link', { name: 'IP Plan' }).click();
  const card = page.getByRole('heading', { name: 'fd20:4d2:20::/64' });
  await expect(card).toBeVisible();
  await expect(page.getByRole('cell', { name: 'fd20:4d2:20::5' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'automatic' })).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/ipv6-plan.png' });
});

test('logical L3: routers, zones and subnets (VIEW-06)', async ({ page }) => {
  await openExample(page);
  await page.getByRole('link', { name: 'Logical' }).click();
  await expect(page).toHaveURL(/\/logical/);
  const map = page.getByRole('list', { name: 'Routers, zones and subnets' });
  await expect(map.getByRole('button', { name: 'Router gw-01, 3 subnets' })).toBeVisible();
  await expect(
    map.getByRole('list', { name: 'LAN' }).getByRole('button', { name: /192\.168\.20\.0\/24/ }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/logical.png' });
  await map.getByRole('button', { name: /192\.168\.10\.0\/24/ }).click();
  await expect(page).toHaveURL(/panel=vlans/);
});

test('IPv6 simulation: reachability over IPv6 and IPv6 from the internet (1.10)', async ({
  page,
}) => {
  await page.goto('./');
  await page
    .getByTestId('import-input')
    .setInputFiles(join(import.meta.dirname, '../../../fixtures/schema/v4/dual-stack.json'));
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.getByRole('link', { name: 'Access' }).click();
  const v6 = page.getByRole('region', { name: 'IPv6 from the internet' });
  await expect(v6.getByText(/local IPv6 prefix \(ULA\)/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Simulate' }).click();
  const panel = inspector(page);
  await expect(panel.getByRole('radio', { name: 'IPv6' })).toBeVisible();
  await panel.getByText('IPv6', { exact: true }).click();
  await expect(page).toHaveURL(/fam=6/);
});
