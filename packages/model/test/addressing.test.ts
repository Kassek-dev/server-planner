import { describe, expect, it } from 'vitest';
import { isValidCidr, isValidIp, subnetForAddress } from '../src';
import { buildHomeLab } from './support/home-lab';

describe('addressing', () => {
  const lab = buildHomeLab();
  it('validates IPs and CIDRs', () => {
    expect(isValidIp('192.168.20.5')).toBe(true);
    expect(isValidIp('192.168.300.5')).toBe(false);
    expect(isValidCidr('10.0.0.0/8')).toBe(true);
    expect(isValidCidr('10.0.0.0/33')).toBe(false);
  });

  it('finds the subnet containing an address', () => {
    const id = subnetForAddress(lab, '192.168.30.77');
    expect(lab.subnets[id ?? '']?.cidr).toBe('192.168.30.0/24');
    expect(subnetForAddress(lab, '10.1.2.3')).toBeUndefined();
    expect(subnetForAddress(lab, 'nope')).toBeUndefined();
  });
});
