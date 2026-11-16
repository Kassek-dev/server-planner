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

/** True for a valid IPv6 address. */
export const isIpv6 = (value: string): boolean =>
  ipaddr.isValid(value.trim()) && ipaddr.parse(value.trim()).kind() === 'ipv6';

/** True for an IPv6 subnet CIDR. */
export function isIpv6Cidr(cidr: string): boolean {
  try {
    return ipaddr.parseCIDR(cidr.trim())[0].kind() === 'ipv6';
  } catch {
    return false;
  }
}

/**
 * NET-17: address family of an assignment — SLAAC, an IPv6 address or a subnet with an IPv6 prefix
 * is IPv6; everything else (also DHCP without a subnet) counts as IPv4. Simulation uses IPv4 only.
 */
export function assignmentFamily(
  project: Pick<Project, 'subnets'>,
  assignment: { mode: string; address?: string | undefined; subnetId?: string | undefined },
): 'ipv4' | 'ipv6' {
  if (assignment.mode === 'slaac') return 'ipv6';
  if (assignment.address && isValidIp(assignment.address))
    return ipaddr.parse(assignment.address.trim()).kind();
  const subnet = assignment.subnetId ? project.subnets[assignment.subnetId] : undefined;
  return subnet && isIpv6Cidr(subnet.cidr) ? 'ipv6' : 'ipv4';
}

/** Canonical text of an address (IPv6 compressed and lower case), for comparisons. */
export function canonicalIp(value: string): string {
  const trimmed = value.trim();
  return ipaddr.isValid(trimmed) ? ipaddr.parse(trimmed).toString() : trimmed;
}
