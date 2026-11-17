/**
 * v3 → v4 (version 1.8): flow scenarios become a project collection (FLW-07); host firewalls
 * (NET-15), VPN zones, bonds and mDNS reflection (NET-16) and naming conventions (LBL-05) are new
 * optional fields. Old projects get an empty collection; nothing else changes. Idempotent.
 */
export function upgradeProjectV3(project: Record<string, unknown>): Record<string, unknown> {
  return { flowScenarios: {}, ...project };
}

export function migrateV3toV4(file: Record<string, unknown>): Record<string, unknown> {
  const project = file.project;
  const snapshots = file.snapshots;
  return {
    ...file,
    ...(isRecord(project) ? { project: upgradeProjectV3(project) } : {}),
    ...(Array.isArray(snapshots)
      ? {
          snapshots: snapshots.map((s) =>
            isRecord(s) && isRecord(s.project) ? { ...s, project: upgradeProjectV3(s.project) } : s,
          ),
        }
      : {}),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
