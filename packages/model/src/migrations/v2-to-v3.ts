/**
 * v2 → v3 (version 1.6): add-in cards and expansion slots (LIB-05), IPv6 address mode `slaac` and
 * the router advertisement mode of IPv6 subnets (NET-17). Every new field is optional, so v2 data
 * is valid v3 data as it is — only the version changes. Projects stored in IndexedDB carry no
 * schema version and need no upgrade. Idempotent.
 */
export function migrateV2toV3(file: Record<string, unknown>): Record<string, unknown> {
  return { ...file };
}
