import { describe, expect, it } from 'vitest';
import { formatPorts, parsePorts } from './FirewallDrawer';

describe('port lists', () => {
  it('parses single ports and ranges', () => {
    expect(parsePorts('80, 443,8000-8100')).toEqual([
      { from: 80, to: 80 },
      { from: 443, to: 443 },
      { from: 8000, to: 8100 },
    ]);
    expect(parsePorts('')).toBeUndefined();
  });
  it('rejects invalid input', () => {
    for (const bad of ['http', '0', '70000', '90-80', '1,,2']) expect(parsePorts(bad)).toBeNull();
  });
  it('formats ranges back', () => {
    expect(
      formatPorts([
        { from: 53, to: 53 },
        { from: 1000, to: 2000 },
      ]),
    ).toBe('53,1000-2000');
  });
});
