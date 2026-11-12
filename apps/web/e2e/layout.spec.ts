import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/** Stage 18: cable bend points, alignment guides and "Group by: None" (CAN-08, LOC-08). */

const fixture = join(import.meta.dirname, '../../../fixtures/schema/v1/home-lab.json');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

async function openExample(page: Page) {
  await page.goto('./');
  await page.getByTestId('import-input').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
}

/** Screen point halfway along a cable that is not covered by a tile. */
async function exposedCablePoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    for (const path of document.querySelectorAll<SVGPathElement>('.react-flow__edge-path')) {
      const length = path.getTotalLength();
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const p = path.getPointAtLength(length * t);
        const m = path.getScreenCTM();
        if (!m) continue;
        const x = p.x * m.a + p.y * m.c + m.e;
        const y = p.x * m.b + p.y * m.d + m.f;
        if (
          document.elementFromPoint(x, y)?.closest('.react-flow__edge') ===
          path.closest('.react-flow__edge')
        )
          return { x, y };
      }
    }
    return null;
  });
  if (!point) throw new Error('no exposed cable');
  return point;
}

test('double-click adds a bend point to a cable; the inspector removes it', async ({ page }) => {
  await openExample(page);
  const at = await exposedCablePoint(page);
  await page.mouse.click(at.x, at.y);
  await expect(inspector(page).getByText(/No bend points/)).toBeVisible();
  await page.mouse.dblclick(at.x, at.y);
  await expect(inspector(page).getByText('1 bend point')).toBeVisible();
  const handle = page.getByRole('button', { name: /^Bend point 1 of 1/ });
  await expect(handle).toBeVisible();
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(inspector(page).getByText('1 bend point')).toBeVisible();
  await page.screenshot({ path: 'test-results/cable-bend-point.png' });

  await inspector(page).getByRole('button', { name: 'Remove bend points' }).click();
  await expect(inspector(page).getByText(/No bend points/)).toBeVisible();
});

test('group by none hides location frames and keeps devices', async ({ page }) => {
  await openExample(page);
  await expect(page.getByText('7U free')).toBeVisible();
  await page.getByLabel('Group by').selectOption('none');
  await expect(page.getByText('7U free')).toBeHidden();
  await expect(page.locator('.react-flow__node', { hasText: 'gw-01' })).toBeVisible();
  await page.screenshot({ path: 'test-results/group-by-none.png' });
  await page.keyboard.press('Control+z');
  await expect(page.getByText('7U free')).toBeVisible();
});
