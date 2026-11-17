import { describe, expect, it } from 'vitest';
import {
  isValidNamingPattern,
  matchesPattern,
  nameFromPattern,
  ProjectSettingsSchema,
} from '../src';

/** LBL-05 naming patterns — and the matcher staying fast on hostile input (no ReDoS). */

describe('naming patterns', () => {
  it('names and matches with one number token', () => {
    expect(nameFromPattern('{site}-{kind}-{nn}', 'switch', 'home', 3)).toBe('home-sw-03');
    expect(matchesPattern('home-sw-03', '{site}-{kind}-{nn}', 'switch', 'home')).toBe(true);
    expect(matchesPattern('home-sw-123', '{site}-{kind}-{nn}', 'switch', 'home')).toBe(true);
    expect(matchesPattern('sw-core', '{site}-{kind}-{nn}', 'switch', 'home')).toBe(false);
  });

  it('accepts exactly one {nn} or {n}', () => {
    expect(isValidNamingPattern('{kind}{n}')).toBe(true);
    expect(isValidNamingPattern('{kind}')).toBe(false);
    expect(isValidNamingPattern('{n}{n}')).toBe(false);
    const settings = {
      capacityThresholds: { warning: 0.7, critical: 0.9 },
      defaultOvercommit: { cpu: 4, memory: 1 },
      storageFreeReserve: 0.1,
      currency: 'EUR',
      naming: { patterns: { switch: '{n}{n}{n}{n}{n}{n}{n}{n}{n}{n}' }, hostnames: false },
    };
    expect(ProjectSettingsSchema.safeParse(settings).success).toBe(false);
  });

  it('stays fast on a hostile pattern and a long name', () => {
    const hostile = '{n}'.repeat(21);
    const name = `${'1'.repeat(200)}x`;
    const start = performance.now();
    expect(matchesPattern(name, hostile, 'switch', '')).toBe(true); // unusable pattern: no flag
    expect(matchesPattern(name, '{n}1{kind}', 'switch', '')).toBe(false);
    expect(matchesPattern(`${'1'.repeat(120)}x`, '{n}', 'switch', '')).toBe(false);
    expect(performance.now() - start).toBeLessThan(50);
  });
});
