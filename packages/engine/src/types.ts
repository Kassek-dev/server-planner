import type { Id } from '@server-planner/model';
import type { InternetAccess } from './simulation/access';

/** Engine results (never stored) — docs/02-model-danych.md § 8. */

export type EntityRef = {
  type:
    | 'device'
    | 'interface'
    | 'link'
    | 'workload'
    | 'app'
    | 'vlan'
    | 'subnet'
    | 'zone'
    | 'rule'
    | 'pool'
    | 'location';
  id: Id;
};

export type Severity = 'error' | 'warning' | 'info';

/** A suggested fix: a model command name and its payload, applied as one undo step. */
export interface IssueFix {
  command: string;
  payload: unknown;
}

export interface Issue {
  /** Translation key under `issues.<code>`, e.g. `VAL_01`. */
  code: string;
  severity: Severity;
  params: Record<string, string | number>;
  targets: EntityRef[];
  fix?: IssueFix;
}

export type UsageStatus = 'ok' | 'warning' | 'critical' | 'over';

export interface ResourceUsage {
  capacity: number;
  used: number;
  ratio: number;
  status: UsageStatus;
  breakdown: {
    ref: EntityRef;
    amount: number;
    kind: 'workload' | 'app' | 'os' | 'zfs-arc';
    unbounded?: boolean;
  }[];
}

export interface CapacityReport {
  host: EntityRef;
  mode: 'allocated';
  cpu: ResourceUsage;
  memory: ResourceUsage;
  storage: (ResourceUsage & { poolId: Id })[];
  children: CapacityReport[];
}

export type DeviceStatus = 'ok' | 'warning' | 'error';

export interface AnalysisResult {
  issues: Issue[];
  /** Capacity per host (device or VM/LXC) ID. */
  capacity: Record<Id, CapacityReport>;
  /** Worst state per device: issues on it, its ports, workloads and apps, and its capacity. */
  deviceStatus: Record<Id, DeviceStatus>;
  /** Internet access per device and VM/LXC with an address (SIM-02). */
  internet: Record<Id, InternetAccess>;
  durationMs: number;
}
