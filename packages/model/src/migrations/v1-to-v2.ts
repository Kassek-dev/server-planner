/**
 * v1 → v2 (version 1.2): reverse proxy routes (NET-11) and local DNS records (NET-14) become
 * project collections. Old projects get them empty; nothing else changes. Idempotent.
 */
export function upgradeProjectV1(project: Record<string, unknown>): Record<string, unknown> {
  return { proxyRoutes: {}, dnsRecords: {}, ...project };
}

export function migrateV1toV2(file: Record<string, unknown>): Record<string, unknown> {
  const project = file.project;
  const snapshots = file.snapshots;
  return {
    ...file,
    ...(isRecord(project) ? { project: upgradeProjectV1(project) } : {}),
    ...(Array.isArray(snapshots)
      ? {
          snapshots: snapshots.map((s) =>
            isRecord(s) && isRecord(s.project) ? { ...s, project: upgradeProjectV1(s.project) } : s,
          ),
        }
      : {}),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
