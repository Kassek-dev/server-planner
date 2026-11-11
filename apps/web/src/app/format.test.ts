import { describe, expect, it } from 'vitest';
import { formatSize, parseSize } from './format';

describe('sizes', () => {
  it('parses binary and decimal units, plain numbers as GiB', () => {
    expect(parseSize('16 GiB')).toBe(16 * 1024 ** 3);
    expect(parseSize('512mib')).toBe(512 * 1024 ** 2);
    expect(parseSize('1 TB')).toBe(1e12);
    expect(parseSize('8')).toBe(8 * 1024 ** 3);
    expect(parseSize('1,5 GiB')).toBe(1.5 * 1024 ** 3);
    expect(parseSize('lots')).toBeUndefined();
  });

  it('formats bytes', () => {
    expect(formatSize(16 * 1024 ** 3)).toBe('16 GiB');
    expect(formatSize(512 * 1024 ** 2)).toBe('512 MiB');
    expect(formatSize(1_000_204_886_016, true)).toBe('1 TB');
  });
});
