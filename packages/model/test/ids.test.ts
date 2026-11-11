import { describe, expect, it } from 'vitest';
import { createId, entityTypeOf, ID_PREFIXES } from '../src';

describe('ids', () => {
  it('creates prefixed ids', () => {
    expect(createId('device')).toMatch(/^dev_[a-f0-9]{12}$/);
    expect(createId('location')).toMatch(/^loc_[a-f0-9]{12}$/);
  });

  it('creates unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createId('link')));
    expect(ids.size).toBe(1000);
  });

  it('resolves entity type from id', () => {
    expect(entityTypeOf(createId('vlan'))).toBe('vlan');
    expect(entityTypeOf('xyz_123')).toBeUndefined();
    expect(entityTypeOf('not-an-id')).toBeUndefined();
  });

  it('has unique prefixes', () => {
    const prefixes = Object.values(ID_PREFIXES);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
