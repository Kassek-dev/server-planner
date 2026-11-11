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

test('VLANs and subnets drawer', async ({ page }) => {
  await openExample(page);
  await inspector(page).getByRole('button', { name: 'VLANs & subnets' }).click();
  const drawer = page.getByRole('dialog', { name: 'VLANs & subnets' });
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(/panel=vlans/);
  await drawer.getByRole('button', { name: 'Add VLAN' }).click();
  await expect(drawer.getByRole('group', { name: 'VLAN 40' })).toBeVisible();

  await drawer.getByRole('tab', { name: 'Subnets' }).click();
  await drawer.getByRole('button', { name: 'Add subnet' }).click();
  await expect(drawer.getByRole('group', { name: '192.168.40.0/24' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page).not.toHaveURL(/panel=/);
});

test('firewall rules: reorder and add', async ({ page }) => {
  await openExample(page);
  await node(page, 'gw-01').click();
  await inspector(page).getByRole('button', { name: 'Open firewall rules' }).click();
  const drawer = page.getByRole('dialog', { name: 'Firewall rules · gw-01' });
  await expect(drawer.getByRole('group', { name: /^Rule / })).toHaveCount(5);

  const rule4 = drawer.getByRole('group', { name: 'Rule 4' });
  await expect(rule4.getByRole('textbox', { name: 'Description' })).toHaveValue('IoT → LAN');
  await rule4.getByRole('button', { name: 'Move up' }).click();
  await expect(
    drawer.getByRole('group', { name: 'Rule 3' }).getByRole('textbox', { name: 'Description' }),
  ).toHaveValue('IoT → LAN');

  await drawer.getByRole('button', { name: 'Add rule' }).click();
  await expect(drawer.getByRole('group', { name: /^Rule / })).toHaveCount(6);
  await page.keyboard.press('Control+Z');
  await expect(drawer.getByRole('group', { name: /^Rule / })).toHaveCount(5);
});

test('tags and project settings', async ({ page }) => {
  await openExample(page);
  await inspector(page).getByRole('button', { name: 'Tags' }).click();
  const tags = page.getByRole('dialog', { name: 'Tags' });
  await tags.getByRole('button', { name: 'Add tag' }).click();
  await tags.getByRole('textbox', { name: 'Name' }).fill('critical');
  await tags.getByRole('textbox', { name: 'Name' }).press('Enter');
  await page.keyboard.press('Escape');

  await node(page, 'nas-01').click();
  await inspector(page).getByRole('checkbox', { name: 'critical' }).check();
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await inspector(page).getByRole('button', { name: 'Tags' }).click();
  await expect(page.getByRole('dialog', { name: 'Tags' }).getByText('1 use')).toBeVisible();
  await page.keyboard.press('Escape');

  await inspector(page).getByRole('button', { name: 'Project settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Project settings' });
  const warning = settings.getByRole('textbox', { name: 'Warning at %' });
  await warning.fill('95');
  await warning.press('Enter');
  await expect(
    settings.getByText('The warning level must be below the critical level.'),
  ).toBeVisible();
  await warning.fill('75');
  await warning.press('Enter');
  await expect(warning).toHaveValue('75');
});
