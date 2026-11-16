import { describe, expect, it } from 'vitest';
import { catalogCorrectionUrl, REPO } from './links';

describe('catalog correction link (CAT-06)', () => {
  it('opens a prefilled issue with the entry and its values', () => {
    const url = new URL(
      catalogCorrectionUrl({
        kind: 'device',
        id: 'lenovo-m720q',
        name: 'Lenovo ThinkCentre M720q',
        catalogVersion: '2026.47',
        facts: { cpu: 'Intel Core i5-8500T', power: undefined, ports: 'eth0 | 1000\nx' },
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(`${REPO}/issues/new`);
    expect(url.searchParams.get('title')).toBe(
      'Catalog: Lenovo ThinkCentre M720q (device/lenovo-m720q)',
    );
    expect(url.searchParams.get('labels')).toBe('catalog');
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('`device/lenovo-m720q`');
    expect(body).toContain('| cpu | Intel Core i5-8500T |');
    expect(body).not.toContain('| power |');
    // Table cells cannot be broken by values from the catalog.
    expect(body).toContain('| ports | eth0   1000 x |');
  });
});
