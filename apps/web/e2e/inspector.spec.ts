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

test('build a Proxmox host with a VM from the inspector', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Mini PC' }).click();
  const panel = inspector(page);
  await expect(panel.getByRole('heading', { name: 'mini-pc-1' })).toBeVisible();

  await panel.getByRole('tab', { name: 'Hardware' }).click();
  await panel.getByRole('button', { name: 'Add module' }).click();
  await expect(panel.getByText('8 GiB', { exact: false }).first()).toBeVisible();

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
