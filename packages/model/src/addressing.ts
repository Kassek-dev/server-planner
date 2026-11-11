import ipaddr from 'ipaddr.js';
import type { Project } from './schema/project';

/** Addressing helpers (NET-03/04) shared by forms and engines. */

export const isValidIp = (value: string): boolean => ipaddr.isValid(value.trim());

export function isValidCidr(value: string): boolean {
  try {
    ipaddr.parseCIDR(value.trim());
    return true;
  } catch {
    return false;
  }
}

/** The project subnet that contains `address` (most specific prefix wins), if any. */
export function subnetForAddress(project: Project, address: string): string | undefined {
  if (!isValidIp(address)) return undefined;
  const ip = ipaddr.parse(address.trim());
  let best: { id: string; prefix: number } | undefined;
  for (const subnet of Object.values(project.subnets)) {
    try {
      const [network, prefix] = ipaddr.parseCIDR(subnet.cidr);
      if (network.kind() !== ip.kind() || !ip.match(network, prefix)) continue;
      if (!best || prefix > best.prefix) best = { id: subnet.id, prefix };
    } catch {
      // Invalid CIDRs are reported by validation, not here.
    }
  }
  return best?.id;
}
