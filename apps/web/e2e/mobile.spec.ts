import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/** Stage 17: phones are view-only (docs/05 § 12) — canvas, bottom sheet, reachability. */

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v2/home-lab.json');
const node = (page: Page, name: string) =>
  page.locator('.react-flow__node', { has: page.getByText(name, { exact: true }) }).first();

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('phone: view a project, inspect a device, refuse edits', async ({ page }) => {
  await page.goto('./');
  await page.screenshot({ path: 'test-results/mobile-projects.png' });
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();

  await expect(page.getByText(/^Editing is available on desktop/)).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Library' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Export' })).toBeHidden();

  await node(page, 'nas-01').tap();
  const sheet = page.getByRole('complementary', { name: 'Inspector' });
  await expect(sheet.getByRole('heading', { name: 'nas-01' })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-sheet.png' });

  // A change is refused with a readable message.
  const name = sheet.getByLabel('Name', { exact: true }).first();
  await name.fill('nas-02');
  await name.press('Enter');
  await expect(sheet.getByText(/^Editing is available on desktop — on a phone/)).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'nas-01' })).toBeVisible();

  await sheet.getByRole('button', { name: 'Expand details' }).tap();
  await sheet.getByRole('button', { name: 'Close details' }).tap();
  await expect(sheet).toBeHidden();

  // Views through the select.
  await page.getByRole('combobox', { name: 'Views' }).selectOption('access');
  await expect(page.getByRole('region', { name: 'Access' })).toBeVisible();
});

test('phone: reachability with lists (M-03)', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.getByRole('button', { name: 'Simulate' }).tap();
  const sheet = page.getByRole('complementary', { name: 'Inspector' });
  const pick = async (label: string, name: string) => {
    const select = sheet.getByRole('combobox', { name: label, exact: true });
    const option = await select
      .locator('option', { hasText: new RegExp(`^${name} · `) })
      .first()
      .textContent();
    await select.selectOption({ label: option ?? name });
  };
  await pick('From', 'tv-salon');
  await pick('To', 'Jellyfin');
  await sheet.getByRole('button', { name: 'Run' }).tap();
  await expect(sheet.getByText('BLOCKED', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-reach.png' });
});

test('phone: full-screen issue list and cards instead of tables (M-04, M-05)', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();

  await page.getByRole('button', { name: /open issues$/ }).tap();
  const sheet = page.getByRole('complementary', { name: 'Inspector' });
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box?.y).toBe(0);
  expect(box?.height).toBe(844);
  await page.screenshot({ path: 'test-results/mobile-issues.png' });
  // A target link closes the list and shows the element in the sheet.
  await sheet.getByRole('button', { name: 'nas-01' }).first().tap();
  await expect(sheet.getByRole('heading', { name: 'nas-01' })).toBeVisible();
  expect((await sheet.boundingBox())?.y).toBeGreaterThan(0);
  await sheet.getByRole('button', { name: 'Close details' }).tap();

  await page.getByRole('combobox', { name: 'Views' }).selectOption('inventory');
  const cards = page.getByRole('list', { name: /^Devices · / });
  await expect(cards.getByRole('textbox', { name: 'Name of nas-01' })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-inventory.png' });

  await page.getByRole('combobox', { name: 'Views' }).selectOption('access');
  const matrix = page.getByRole('list', { name: 'Who can reach whom' });
  await matrix.getByRole('button', { name: /^IoT to LAN:/ }).tap();
  await expect(page.getByText(/^IoT → LAN:/)).toBeVisible();
});
