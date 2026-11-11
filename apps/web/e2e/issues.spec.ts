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

test('issues: counters, panel, reveal and fix', async ({ page }) => {
  await openExample(page);
  const counters = page.getByRole('button', { name: /2 errors, .* open issues/ });
  await expect(counters).toBeVisible();
  await expect(node(page, 'sw-core').getByRole('img', { name: 'Has errors' })).toBeVisible();

  await counters.click();
  const panel = inspector(page);
  await expect(panel.getByRole('heading', { name: 'Issues' })).toBeVisible();
  await expect(panel.getByText('VLAN 30 not allowed on sw-core Port 8.')).toBeVisible();
  await expect(
    panel.getByText('192.168.20.15 is assigned more than once', { exact: false }),
  ).toBeVisible();

  await panel.getByRole('button', { name: 'Allow VLAN 30 on Port 8' }).click();
  await expect(page.getByRole('button', { name: /1 error, .* open issues/ })).toBeVisible();
  await panel.getByRole('button', { name: 'Use the next free address' }).click();
  await expect(page.getByRole('button', { name: /0 errors, .* open issues/ })).toBeVisible();

  await page.keyboard.press('Control+Z');
  await expect(page.getByRole('button', { name: /1 error, .* open issues/ })).toBeVisible();
});

test('capacity tab and host tile memory bar', async ({ page }) => {
  await openExample(page);
  await expect(node(page, 'pve1').getByText('RAM')).toBeVisible();
  await node(page, 'pve1').click();
  const panel = inspector(page);
  await expect(panel.getByRole('tab', { name: 'Capacity', selected: true })).toBeVisible();
  await expect(panel.getByText('15 GiB / 32 GiB · 47%')).toBeVisible();
  await expect(panel.getByRole('meter', { name: 'Memory 47%' })).toBeVisible();
  await panel.getByRole('button', { name: 'docker-vm' }).first().click();
  await expect(panel.getByRole('heading', { name: 'docker-vm' })).toBeVisible();
  await expect(panel.getByText('2 vCPU / 2 vCPU · 100%')).toBeVisible();
});
