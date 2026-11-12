import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json');

async function openExample(page: Page) {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}

test('access view: zone matrix, cell path and assertions', async ({ page }) => {
  await openExample(page);
  await page.getByRole('link', { name: 'Access' }).click();
  await expect(page).toHaveURL(/\/access/);
  const view = page.getByRole('region', { name: 'Access' });

  const iotToLan = view.getByRole('button', { name: /^IoT to LAN:/ });
  await expect(iotToLan).toBeVisible();
  await iotToLan.click();
  await expect(view.getByText(/^IoT → LAN:/)).toBeVisible();
  await expect(
    view.getByText('No port forwards — nothing is reachable from the internet.'),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/access-matrix.png', fullPage: true });

  // New assertion: IoT must not reach LAN over SSH.
  await view.getByRole('button', { name: 'Add assertion' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save as assertion' });
  await dialog.getByLabel('Name').fill('IoT no SSH to LAN');
  await dialog.getByRole('combobox', { name: 'Source' }).selectOption({ label: 'IoT · zone' });
  await dialog.getByRole('combobox', { name: 'Destination' }).selectOption({ label: 'LAN · zone' });
  await dialog.getByLabel('Port').fill('22');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const row = view.getByRole('row', { name: /IoT no SSH to LAN/ });
  await expect(row.getByText('Passed')).toBeVisible();
  await expect(row).toContainText('IoT → LAN · tcp/22');

  // Flip the expectation: the assertion now fails and shows up in Issues.
  await row.getByRole('button', { name: 'Edit “IoT no SSH to LAN”' }).click();
  await page
    .getByRole('dialog', { name: 'Edit assertion' })
    .locator('label', { hasText: 'Reachable' })
    .click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByText('Failed — blocked')).toBeVisible();
  await expect(view.getByText('1 assertion · 1 failing')).toBeVisible();
  await page.screenshot({ path: 'test-results/access-assertions.png', fullPage: true });

  await row.getByRole('button', { name: 'Delete “IoT no SSH to LAN”' }).click();
  await expect(view.getByText(/No assertions yet/)).toBeVisible();
});

test('reachability result can be saved as an assertion', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Simulate' }).click();
  const panel = page.getByRole('complementary', { name: 'Inspector' });
  const from = panel.getByRole('combobox', { name: 'From', exact: true });
  await from.selectOption({
    label:
      (await from
        .locator('option', { hasText: /^tv-salon · / })
        .first()
        .textContent()) ?? '',
  });
  const to = panel.getByRole('combobox', { name: 'To', exact: true });
  await to.selectOption({
    label:
      (await to
        .locator('option', { hasText: /^Jellyfin · / })
        .first()
        .textContent()) ?? '',
  });
  await panel.getByRole('button', { name: 'Run' }).click();
  await panel.getByRole('button', { name: 'Save as assertion' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save as assertion' });
  await expect(dialog.getByRole('combobox', { name: 'Source' })).toHaveValue(/^device:/);
  await expect(dialog.getByLabel('Port')).toHaveValue('8096');
  await expect(dialog.getByRole('radio', { name: 'Blocked' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: 'Access' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Access' })
      .getByRole('row', { name: /tv-salon → Jellyfin/ })
      .getByText('Passed'),
  ).toBeVisible();
});

test('typical segmentation adds a Guest network to the home lab', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'VLANs & subnets' }).click();
  await page.getByRole('button', { name: 'Typical segmentation…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Typical segmentation' });
  await expect(dialog.getByRole('checkbox', { name: 'IoT · VLAN 30' })).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: 'Guest · VLAN 40' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Create 1 segment' }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'Access' }).click();
  const view = page.getByRole('region', { name: 'Access' });
  await expect(view.getByRole('columnheader', { name: 'Guest' })).toBeVisible();
});
