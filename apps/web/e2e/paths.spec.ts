import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/** End-to-end user paths from docs/05 § 6 (A: new lab from scratch, B: will my hardware cope?). */

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const node = (page: Page, name: string) =>
  page.locator('.react-flow__node', { has: page.getByText(name, { exact: true }) }).first();
const library = (page: Page) => page.getByRole('complementary', { name: 'Library' });

async function optionLabel(page: Page, select: ReturnType<Page['getByRole']>, pattern: RegExp) {
  return (await select.locator('option', { hasText: pattern }).first().textContent()) ?? '';
}

test('path A — a new lab from scratch', async ({ page }) => {
  // 1–2. New empty project, empty canvas with hints.
  await page.goto('./');
  await page.getByRole('button', { name: 'New project' }).click();
  const create = page.getByRole('dialog', { name: 'New project' });
  await create.getByLabel('Project name').fill('Path A lab');
  await create.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('button', { name: 'Add rack' })).toBeVisible();

  // 3–4. A rack with a router and a switch (the first router brings Internet), a mini PC beside it.
  await page.getByRole('button', { name: 'Add rack' }).click();
  await library(page)
    .getByRole('button', { name: /^Router/ })
    .click();
  await expect(page.getByText('Internet added and connected to router-1 WAN')).toBeVisible();
  await library(page)
    .getByRole('button', { name: /^Switch/ })
    .click();
  await expect(node(page, 'switch-1')).toBeVisible();
  await library(page)
    .getByRole('button', { name: /^Mini PC/ })
    .dragTo(page.getByRole('region', { name: 'Canvas' }), { targetPosition: { x: 120, y: 420 } });
  await expect(node(page, 'mini-pc-1')).toBeVisible();

  // 6. Hardware from the catalog.
  await node(page, 'mini-pc-1').click();
  const panel = inspector(page);
  await panel.getByRole('tab', { name: 'Hardware' }).click();
  await panel.getByRole('button', { name: 'Choose model' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose device model · mini-pc-1' });
  await picker.getByRole('button', { name: 'Lenovo ThinkCentre M720q Tiny' }).dblclick();
  await expect(panel.getByText('Lenovo ThinkCentre M720q Tiny')).toBeVisible();

  // 7. Proxmox → a VM → Jellyfin from the catalog into the VM.
  await panel.getByRole('tab', { name: 'Software' }).click();
  await panel.getByRole('combobox', { name: 'System' }).selectOption({ label: 'Proxmox VE' });
  await panel.getByRole('button', { name: 'Add VM' }).click();
  await expect(panel.getByRole('heading', { name: 'vm-1' })).toBeVisible();
  await panel.getByRole('button', { name: 'Add app from catalog' }).click();
  const catalog = page.getByRole('dialog', { name: 'App catalog' });
  await catalog.getByRole('searchbox', { name: 'Search apps' }).fill('jellyfin');
  await catalog.getByRole('checkbox', { name: 'Select Jellyfin' }).check();
  await catalog.getByRole('button', { name: 'Configure…' }).click();
  await page
    .getByRole('dialog', { name: 'Add app · Jellyfin' })
    .getByRole('button', { name: 'Add Jellyfin' })
    .click();
  await expect(page.getByText('Jellyfin added (1 container)')).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Jellyfin' })).toBeVisible();

  // 8. Capacity of the host.
  await node(page, 'mini-pc-1').click();
  await panel.getByRole('tab', { name: 'Capacity' }).click();
  await expect(panel.getByRole('meter', { name: /^Memory \d+%$/ })).toBeVisible();

  // 10. Export JSON — a complete backup.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export' }).getByText('JSON', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const file = await (await download).path();
  const exported = JSON.parse(await readFile(file, 'utf8'));
  const apps = Object.values(exported.project.apps) as {
    name: string;
    catalogRef?: { id: string };
  }[];
  expect(apps.map((a) => a.catalogRef?.id)).toContain('jellyfin');
});

test('path B — will my hardware cope?', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await node(page, 'pve1').click();
  const panel = inspector(page);
  const memory = panel.getByRole('meter', { name: /^Memory \d+%$/ });
  await expect(memory).toHaveAccessibleName('Memory 47%');

  await panel.getByRole('button', { name: 'Add apps from catalog' }).click();
  const catalog = page.getByRole('dialog', { name: 'App catalog' });
  for (const name of ['Immich', 'Nextcloud', 'PhotoPrism', 'Frigate']) {
    await catalog.getByRole('searchbox', { name: 'Search apps' }).fill(name.toLowerCase());
    await catalog.getByRole('checkbox', { name: `Select ${name}` }).check();
  }
  const target = catalog.getByRole('combobox', { name: 'Target host' });
  await target.selectOption({ label: await optionLabel(page, target, /^target: pve1$/) });
  await catalog.getByRole('button', { name: 'Add 4 apps' }).click();
  await expect(page.getByText(/Apps added \(\d+ containers\)/)).toBeVisible();

  // The bars update and the overload becomes an issue with a tip.
  await node(page, 'pve1').click();
  await panel.getByRole('tab', { name: 'Capacity' }).click();
  await expect(memory).not.toHaveAccessibleName('Memory 47%');
  await page.getByRole('button', { name: /errors?, .* open issues/ }).click();
  await expect(panel.getByText('VAL_13', { exact: false }).first()).toBeVisible();
});

test('export the canvas as PNG and SVG (D-04)', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(node(page, 'pve1')).toBeVisible();

  for (const format of ['PNG', 'SVG']) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    await dialog.getByText(format, { exact: true }).click();
    await dialog.getByText('Light', { exact: true }).click();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: `Export ${format}` }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(
      new RegExp(`^home-lab-\\d{4}-\\d{2}-\\d{2}\\.${format.toLowerCase()}$`),
    );
    const body = await readFile(await file.path());
    expect(body.length).toBeGreaterThan(10_000);
    await expect(dialog).toBeHidden();
  }

  // Only the selection.
  await node(page, 'pve1').click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByText('PNG', { exact: true }).click();
  await dialog.getByText('Selection (1)').click();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export PNG' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
});
