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
const node = (page: Page, name: string) =>
  page.locator('.react-flow__node', { has: page.getByText(name, { exact: true }) }).first();

test('add an app stack from the catalog through the wizard (D-06 → D-07)', async ({ page }) => {
  await openExample(page);
  await node(page, 'pve1').click();
  await inspector(page).getByRole('tab', { name: 'Software' }).click();
  await inspector(page).getByRole('button', { name: 'Add app from catalog' }).click();

  const catalog = page.getByRole('dialog', { name: 'App catalog' });
  await catalog.getByRole('searchbox', { name: 'Search apps' }).fill('immich');
  await expect(catalog.getByText('1 app', { exact: true })).toBeVisible();
  await catalog.getByRole('checkbox', { name: 'Select Immich' }).check();
  await catalog.getByRole('button', { name: 'Configure…' }).click();

  const wizard = page.getByRole('dialog', { name: 'Add app · Immich' });
  await expect(
    wizard.getByText('Docker directly on Proxmox VE is discouraged', { exact: false }),
  ).toBeVisible();
  const host = wizard.getByRole('combobox', { name: 'Host, VM or LXC' });
  const vm = await host.locator('option', { hasText: /^docker-vm/ }).textContent();
  await host.selectOption({ label: vm ?? '' });
  await wizard.getByRole('button', { name: 'Next: ports & storage' }).click();
  await expect(
    wizard.getByRole('textbox', { name: 'Host port for immich-server :2283' }),
  ).toHaveValue('2283');
  await wizard.getByRole('button', { name: 'Add Immich' }).click();

  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(inspector(page).getByRole('heading', { name: 'Immich' })).toBeVisible();
  // The stack landed on docker-vm, and undo removes it in one step.
  await page.keyboard.press('Control+Z');
  await expect(inspector(page).getByRole('heading', { name: 'Immich' })).toBeHidden();
});

test('port conflicts are flagged with a free alternative', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Browse apps' }).click();
  const catalog = page.getByRole('dialog', { name: 'App catalog' });
  await catalog.getByRole('searchbox', { name: 'Search apps' }).fill('jellyfin');
  await catalog.getByRole('checkbox', { name: 'Select Jellyfin' }).check();
  await catalog.getByRole('button', { name: 'Configure…' }).click();
  const wizard = page.getByRole('dialog', { name: 'Add app · Jellyfin' });
  const host = wizard.getByRole('combobox', { name: 'Host, VM or LXC' });
  await host.selectOption({
    label: (await host.locator('option', { hasText: /^docker-vm/ }).textContent()) ?? '',
  });
  await wizard.getByRole('button', { name: 'Ports & storage', exact: true }).click();
  await expect(wizard.getByText('Port 8096 is already used on this host.')).toBeVisible();
  await wizard.getByRole('button', { name: 'Use 8097' }).click();
  await expect(wizard.getByRole('textbox', { name: 'Host port for jellyfin :8096' })).toHaveValue(
    '8097',
  );
  await expect(wizard.getByText('already used')).toBeHidden();
});

test('several apps at once go to the chosen host', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Browse apps' }).click();
  const catalog = page.getByRole('dialog', { name: 'App catalog' });
  await catalog.getByRole('button', { name: /^DNS/ }).click();
  await catalog.getByRole('checkbox', { name: 'Select Pi-hole' }).check();
  await catalog.getByRole('checkbox', { name: 'Select Unbound' }).check();
  const target = catalog.getByRole('combobox', { name: 'Target host' });
  await target.selectOption({
    label: (await target.locator('option', { hasText: /docker-vm/ }).textContent()) ?? '',
  });
  await catalog.getByRole('button', { name: 'Add 2 apps' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const panel = inspector(page);
  await expect(panel.getByRole('heading', { name: 'docker-vm' })).toBeVisible();
  await expect(panel.getByText('pihole', { exact: true })).toBeVisible();
  await expect(panel.getByText('unbound', { exact: true })).toBeVisible();
});

test('device model from the library and in the Hardware tab (D-05)', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Browse device models' }).click();
  const picker = page.getByRole('dialog', { name: 'Browse device models' });
  await picker.getByRole('searchbox', { name: 'Search models or CPUs' }).fill('m720q');
  await picker.getByRole('button', { name: 'Lenovo ThinkCentre M720q Tiny' }).click();
  await picker.getByRole('button', { name: 'Use this model' }).click();
  const panel = inspector(page);
  await panel.getByRole('tab', { name: 'Hardware' }).click();
  await expect(panel.getByText('Lenovo ThinkCentre M720q Tiny')).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Model' }).first()).toHaveValue(
    'Intel Core i5-8500T',
  );

  // An existing NAS takes a Synology model.
  await node(page, 'nas-01').click();
  await panel.getByRole('tab', { name: 'Hardware' }).click();
  await panel.getByRole('button', { name: 'Choose model' }).click();
  const forNas = page.getByRole('dialog', { name: 'Choose device model · nas-01' });
  await expect(forNas.getByText('2 models')).toBeVisible();
  await forNas.getByRole('button', { name: 'Synology DiskStation DS920+' }).dblclick();
  await expect(panel.getByText('Synology DiskStation DS920+')).toBeVisible();
});
