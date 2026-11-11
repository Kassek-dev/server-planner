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

test('renders the example lab: rack, tiles and links', async ({ page }) => {
  await openExample(page);
  for (const name of ['gw-01', 'sw-core', 'nas-01', 'pve1', 'ap-living', 'tv-salon']) {
    await expect(node(page, name)).toBeVisible();
  }
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
  await expect(page.getByText('7U free')).toBeVisible();
  await page.screenshot({ path: 'test-results/canvas-example.png' });
});

test('add from the library, select, rename, delete and undo', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Mini PC', exact: false }).first().click();
  await expect(node(page, 'mini-pc-1')).toBeVisible();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByRole('heading', { name: 'mini-pc-1' })).toBeVisible();
  await expect(page).toHaveURL(/sel=dev_/);
  await inspector.getByLabel('Name').fill('pve2');
  await inspector.getByLabel('Name').press('Enter');
  await expect(node(page, 'pve2')).toBeVisible();

  await node(page, 'pve2').click();
  await page.keyboard.press('Delete');
  await expect(node(page, 'pve2')).toHaveCount(0);
  await page.keyboard.press('Control+Z');
  await expect(node(page, 'pve2')).toBeVisible();
});

test('connect two devices by dragging from a handle', async ({ page }) => {
  await openExample(page);
  const before = await page.locator('.react-flow__edge').count();
  const source = node(page, 'nas-01');
  await source.hover();
  const handle = source.locator('.react-flow__handle-right');
  const target = node(page, 'pve1');
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('no boxes');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 12 });
  await target.locator('.react-flow__handle-left').hover();
  await page.mouse.up();
  // pve1 has no free copper port (eth0 is used) — the canvas explains why.
  await expect(
    page.getByRole('status').filter({ hasText: 'No free compatible ports' }),
  ).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(before);
});
