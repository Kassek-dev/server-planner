import { SCHEMA_VERSION } from '@server-planner/model';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_SCHEMA_VERSION } from '../src';

describe('engine', () => {
  it('supports the current model schema', () => {
    expect(SUPPORTED_SCHEMA_VERSION).toBe(SCHEMA_VERSION);
  });
});
