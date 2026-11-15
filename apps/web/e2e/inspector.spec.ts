import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v2/home-lab.json');

async function openExample(page: Page) {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}

const node = (page: Page, name: string) =>
  page.locator('.react-flow__node', { has: page.getByText(name, { exact: true }) }).first();
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

test('build a Proxmox host with a VM from the inspector', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Mini PC' }).click();
  const panel = inspector(page);
  await expect(panel.getByRole('heading', { name: 'mini-pc-1' })).toBeVisible();

  await panel.getByRole('tab', { name: 'Hardware' }).click();
  await panel.getByRole('button', { name: 'Add module' }).click();
  await expect(panel.getByText('8 GiB', { exact: true })).toBeVisible();

  await panel.getByRole('tab', { name: 'Software' }).click();
  await panel.getByLabel('System').selectOption('proxmox-ve');
  await panel.getByRole('button', { name: 'Add VM' }).click();

  await expect(panel.getByRole('heading', { name: 'vm-1' })).toBeVisible();
  await panel.getByLabel('vCPU').fill('4');
  await panel.getByLabel('vCPU').press('Enter');
  await expect(panel.getByLabel('net0 bridge')).toHaveValue(/.+/);

  await panel
    .getByRole('navigation', { name: 'Location in hierarchy' })
    .getByRole('button', { name: 'mini-pc-1' })
    .click();
  await panel.getByRole('tab', { name: 'Software' }).click();
  await expect(panel.getByRole('button', { name: /vm-1/ })).toContainText('4c');

  await page.keyboard.press('Control+Z');
  await expect(panel.getByRole('button', { name: /vm-1/ })).toContainText('2c');
});

test('switch port VLAN and router VLAN interface', async ({ page }) => {
  await openExample(page);
  await node(page, 'sw-core').click();
  const panel = inspector(page);
  await expect(panel.getByRole('tab', { name: 'Network', selected: true })).toBeVisible();
  await expect(page).toHaveURL(/sel=dev_/);

  const port8 = panel.getByRole('group', { name: 'Port 8' });
  await expect(port8).toBeVisible();
  await port8.getByRole('checkbox', { name: '30 IoT' }).check();
  await expect(port8.getByRole('checkbox', { name: '30 IoT' })).toBeChecked();

  await node(page, 'gw-01').click();
  await panel.getByRole('button', { name: 'Add VLAN interface' }).click();
  await expect(panel.getByRole('group', { name: 'lan0.40' })).toBeVisible();
});

test('rejected change shows a readable message', async ({ page }) => {
  await openExample(page);
  await node(page, 'pve1').click();
  const panel = inspector(page);
  await panel.getByRole('tab', { name: 'Hardware' }).click();
  await panel.getByLabel('Location').selectOption({ label: 'Closet rack · Rack' });
  // pve1 is standalone: it goes on the rack shelf at U10.
  await expect(panel.getByText('Shelf at U10')).toBeVisible();
});

test('move a VM to another Proxmox host (SW-11)', async ({ page }) => {
  await openExample(page);
  await page
    .getByRole('complementary', { name: 'Library' })
    .getByRole('button', { name: /^Mini PC/ })
    .click();
  const panel = inspector(page);
  await expect(panel.getByRole('heading', { name: 'mini-pc-1' })).toBeVisible();
  await panel.getByRole('tab', { name: 'Software' }).click();
  await panel.getByLabel('System').selectOption('proxmox-ve');

  await node(page, 'pve1').click();
  await panel.getByRole('tab', { name: 'Software' }).click();
  await panel.getByRole('button', { name: /docker-vm/ }).click();
  await expect(panel.getByRole('heading', { name: 'docker-vm' })).toBeVisible();
  const host = panel.getByLabel('Runs on (move to another host)');
  await expect(host.locator('option')).toHaveText(['pve1', 'mini-pc-1']);
  await host.selectOption({ label: 'mini-pc-1' });
  await expect(
    panel.getByRole('navigation', { name: 'Location in hierarchy' }).getByRole('button', {
      name: 'mini-pc-1',
    }),
  ).toBeVisible();
  await expect(panel.getByLabel('net0 bridge')).toHaveValue(/.+/);
});

test('add several disks at once and build a pool with its capacity', async ({ page }) => {
  await openExample(page);
  await page
    .getByRole('complementary', { name: 'Library' })
    .getByRole('button', { name: /^NAS/ })
    .click();
  const panel = inspector(page);
  await panel.getByRole('tab', { name: 'Hardware' }).click();
  await expect(panel.getByText(/^No disks yet/)).toBeVisible();
  await expect(panel.getByText(/^No storage pools. Add disks first/)).toBeVisible();

  const form = panel.getByRole('form', { name: 'Add disks' });
  await form.getByLabel('Count').selectOption('4');
  await form.getByLabel('Type').selectOption('hdd');
  await form.getByLabel('Size').fill('8 TB');
  await form.getByRole('button', { name: 'Add disks' }).click();
  await expect(panel.getByRole('heading', { name: '4 disks' })).toBeVisible();
  await expect(panel.getByText('32 TB raw in total')).toBeVisible();

  await panel.getByRole('button', { name: 'Add pool' }).click();
  await expect(panel.getByLabel('Layout')).toHaveValue('raidz1');
  await expect(panel.getByText('24 TB usable of 32 TB raw · 4 disks')).toBeVisible();
  await panel.getByLabel('Layout').selectOption('raidz3');
  await expect(panel.getByText('raidz3 needs at least 5 disks; this pool has 4.')).toBeVisible();
  await page.screenshot({ path: 'test-results/disks-pool.png', fullPage: true });
});

test('add CPU, memory, GPU and disks from predefined lists (HW-09)', async ({ page }) => {
  await openExample(page);
  await page
    .getByRole('complementary', { name: 'Library' })
    .getByRole('button', { name: /^Mini PC/ })
    .click();
  const panel = inspector(page);
  await panel.getByRole('tab', { name: 'Hardware' }).click();

  const cpu = panel.getByLabel('Add a CPU from the catalog');
  await cpu.selectOption({ label: await optionLabel(cpu, /^Intel N100 · /) });
  await expect(panel.getByRole('textbox', { name: 'Model' }).first()).toHaveValue('Intel N100');
  await expect(cpu).toHaveValue('');

  await panel.getByLabel('Add memory from a list').selectOption('DDR5-5600-2x16');
  await expect(panel.getByText('32 GiB', { exact: true })).toBeVisible();

  const gpu = panel.getByLabel('Add a GPU or accelerator from the catalog');
  await gpu.selectOption({ label: await optionLabel(gpu, /^Google Coral USB/) });
  await expect(panel.getByRole('group', { name: 'Google Coral USB Accelerator' })).toBeVisible();

  const form = panel.getByRole('form', { name: 'Add disks' });
  await form.getByLabel('Common disks').selectOption('hdd-8000');
  await expect(form.getByLabel('Type')).toHaveValue('hdd');
  await expect(form.getByLabel('Size')).toHaveValue('8 TB');
});

async function optionLabel(select: import('@playwright/test').Locator, pattern: RegExp) {
  const option = await select.locator('option', { hasText: pattern }).first().textContent();
  if (!option) throw new Error(`no option ${pattern}`);
  return option;
}
