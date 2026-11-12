import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json');

async function openExample(page: Page) {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const node = (page: Page, name: string) =>
  page.locator('.react-flow__node', { has: page.getByText(name, { exact: true }) }).first();

async function choose(select: Locator, name: string) {
  const label = await select
    .locator('option', { hasText: new RegExp(`^${name} · `) })
    .first()
    .textContent();
  await select.selectOption({ label: label ?? name });
}

async function runTvToJellyfin(page: Page) {
  const panel = inspector(page);
  await choose(panel.getByRole('combobox', { name: 'From', exact: true }), 'tv-salon');
  await choose(panel.getByRole('combobox', { name: 'To', exact: true }), 'Jellyfin');
  await expect(panel.getByLabel('Port', { exact: true })).toHaveValue('8096');
  await panel.getByRole('button', { name: 'Run' }).click();
}

test('reachability: TV → Jellyfin is blocked, then fixed via Suggest fix', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Simulate' }).click();
  const panel = inspector(page);
  await expect(panel.getByRole('heading', { name: 'Simulation' })).toBeVisible();

  await runTvToJellyfin(page);
  await expect(panel.getByText('BLOCKED', { exact: true })).toBeVisible();
  await expect(
    panel.getByText('VLAN 30 (IoT) not allowed on sw-core Port 8.').first(),
  ).toBeVisible();
  // Canvas card (O-08) and dimmed elements off the path.
  await expect(
    page.getByRole('region', { name: 'Canvas' }).getByText('BLOCKED', { exact: true }),
  ).toBeVisible();
  await expect(node(page, 'nas-01')).toHaveClass(/sp-dim/);
  await expect(node(page, 'sw-core')).toHaveClass(/sp-blocked/);

  // Fix the VLAN through the Issues panel, then run again.
  await page.getByRole('button', { name: /2 errors, .* open issues/ }).click();
  await panel.getByRole('button', { name: 'Allow VLAN 30 on Port 8' }).click();
  await page.getByRole('button', { name: 'Simulate' }).click();
  await runTvToJellyfin(page);
  await expect(panel.getByText('Blocked by rule #4 on gw-01 (IoT → LAN).').first()).toBeVisible();

  await panel.getByRole('button', { name: 'Suggest fix' }).click();
  const dialog = page.getByRole('dialog', { name: 'Suggested fix' });
  await expect(
    dialog.getByText('Add a rule on gw-01 at position #4: allow IoT → Jellyfin · tcp/8096.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(panel.getByText('ALLOWED', { exact: true })).toBeVisible();
  await expect(panel.getByText('Jellyfin listens on tcp/8096.').first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel.getByRole('heading', { name: 'Simulation' })).toBeHidden();
  await expect(node(page, 'nas-01')).not.toHaveClass(/sp-dim/);
});

test('access: internet overlay and services visible from a client', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Simulate' }).click();
  const panel = inspector(page);
  await panel.getByRole('tab', { name: 'Access' }).click();
  await panel.getByRole('group', { name: 'Internet access' }).getByText('On').click();
  await expect(
    node(page, 'pve1').getByRole('img', { name: 'Internet access: full' }),
  ).toBeVisible();
  await expect(
    node(page, 'tv-salon').getByRole('img', { name: 'Internet access: none' }),
  ).toBeVisible();

  await choose(panel.getByRole('combobox', { name: 'Point of view' }), 'nas-01');
  await expect(panel.getByText('From nas-01 · 1 of 1 reachable')).toBeVisible();
  await expect(
    node(page, 'pve1').getByRole('img', { name: 'Services visible from the viewpoint: full' }),
  ).toBeVisible();
});

test('overlays: links by speed and devices by zone', async ({ page }) => {
  await openExample(page);
  await page.getByRole('combobox', { name: 'Links by' }).selectOption('speed');
  await expect(page.getByText('≥ 10 Gb/s')).toBeVisible();
  await page.getByRole('combobox', { name: 'Devices by' }).selectOption('zone');
  await expect(node(page, 'nas-01')).toHaveAttribute('style', /outline/);
});

test('flows: a catalog process played step by step (FLW-01…05)', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: /2 errors, .* open issues/ }).click();
  await inspector(page).getByRole('button', { name: 'Allow VLAN 30 on Port 8' }).click();
  await page.getByRole('button', { name: 'Simulate' }).click();
  const panel = inspector(page);
  await panel.getByRole('tab', { name: 'Flows' }).click();
  await expect(panel.getByRole('combobox', { name: 'Process' })).toHaveValue('jellyfin.play-movie');
  await expect(panel.getByRole('combobox', { name: 'Client' })).toHaveValue(/dev_/);

  await panel.getByRole('button', { name: 'Run flow' }).click();
  await expect(panel.getByText(/Flow blocked/)).toBeVisible();
  await expect(panel.getByText('Blocked by rule #4 on gw-01 (IoT → LAN).').first()).toBeVisible();
  const timeline = page.getByRole('region', { name: 'Flow timeline' });
  await expect(timeline).toBeVisible();
  await expect(
    timeline.getByRole('button', { name: /tv-salon → Jellyfin · tcp\/8096/ }),
  ).toBeVisible();

  await choose(panel.getByRole('combobox', { name: 'Client', exact: true }), 'nas-01');
  await panel.getByRole('button', { name: 'Run flow' }).click();
  await expect(panel.getByText(/Flow works/)).toBeVisible();
  await timeline.getByRole('button', { name: 'First step' }).isVisible();
});
