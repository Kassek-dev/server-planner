import { expect, test } from '@playwright/test';

test('app loads the projects page', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Plan your home lab' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /dark|light/);
});

test('unknown hash route shows Not found', async ({ page }) => {
  await page.goto('./#/nowhere');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
