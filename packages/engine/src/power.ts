import type { Id } from '@server-planner/model';
import { usageStatus } from './capacity';
import { type EngineContext, peerOf } from './context';
import type { CapacityReport, UsageStatus } from './types';

/**
 * Power, PoE and UPS (HW-06, CAP-07, CAP-08). Estimates only: the expected draw interpolates
 * between idle and load by the host's allocated CPU share.
 */

/** Upper bound of a powered device per PoE standard (802.3af/at/bt, at the device). */
const POE_STANDARD_W = { af: 13, at: 25.5, bt: 51 } as const;
/** Usable share of a UPS battery (inverter losses, cut-off before empty). */
const UPS_EFFICIENCY = 0.8;
const HOURS_PER_MONTH = (365.25 * 24) / 12;

export interface DevicePower {
  idleW: number;
  loadW: number;
  expectedW: number;
  /** Where the numbers come from: the hardware spec, the PoE draw of the port, or nothing. */
  source: 'spec' | 'poe' | 'none';
  /** Switch port powering this device. */
  poweredBy?: { deviceId: Id; interfaceId: Id };
}

export interface PoeBudget {
  deviceId: Id;
  budgetW: number;
  usedW: number;
  ratio: number;
  status: UsageStatus;
  ports: { interfaceId: Id; deviceId: Id; drawW: number }[];
}

export interface UpsReport {
  deviceId: Id;
  capacityW: number;
  loadW: number;
  ratio: number;
  status: UsageStatus;
  /** Minutes on battery at the expected load; absent without battery capacity or load. */
  runtimeMin?: number;
  protected: Id[];
}

export interface PowerReport {
  devices: Record<Id, DevicePower>;
  totalIdleW: number;
  totalExpectedW: number;
  monthlyKwh: number;
  monthlyCost?: { amount: number; currency: string };
  poe: PoeBudget[];
  ups: UpsReport[];
  /** Devices without any power figure — the totals undercount them. */
  unknown: Id[];
}

/** Location and its ancestors (rack → room). */
function locationChain(ctx: EngineContext, id: string | undefined): string[] {
  const chain: string[] = [];
  for (let at = id, depth = 0; at && depth < 8; depth += 1) {
    chain.push(at);
    at = ctx.project.locations[at]?.parentId;
  }
  return chain;
}

export function power(ctx: EngineContext, capacity: Record<Id, CapacityReport>): PowerReport {
  const p = ctx.project;
  const devices: Record<Id, DevicePower> = {};

  // PoE: every link between a PSE port and a PD port.
  const poeByPse = new Map<Id, PoeBudget['ports']>();
  const poweredBy = new Map<Id, { deviceId: Id; interfaceId: Id; drawW: number }>();
  for (const iface of Object.values(p.interfaces)) {
    if (iface.poe?.role !== 'pse') continue;
    const pse = ctx.deviceOfInterface.get(iface.id);
    if (!pse) continue;
    for (const link of ctx.linksByInterface.get(iface.id) ?? []) {
      const peer = p.interfaces[peerOf(link, iface.id)];
      if (peer?.poe?.role !== 'pd') continue;
      const pd = ctx.deviceOfInterface.get(peer.id);
      if (!pd || poweredBy.has(pd.id)) continue;
      const standard = peer.poe.standard ?? iface.poe.standard ?? 'at';
      const drawW = peer.poe.drawW ?? pd.hardware.power?.loadW ?? POE_STANDARD_W[standard];
      poweredBy.set(pd.id, { deviceId: pse.id, interfaceId: iface.id, drawW });
      const ports = poeByPse.get(pse.id) ?? [];
      ports.push({ interfaceId: iface.id, deviceId: pd.id, drawW });
      poeByPse.set(pse.id, ports);
    }
  }

  const unknown: Id[] = [];
  for (const d of Object.values(p.devices)) {
    if (d.kind === 'internet') continue;
    const spec = d.hardware.power;
    const poe = poweredBy.get(d.id);
    const cpu = capacity[d.id]?.cpu.ratio ?? 0;
    const share = Math.min(1, Math.max(0, cpu));
    if (spec) {
      devices[d.id] = {
        idleW: spec.idleW,
        loadW: spec.loadW,
        expectedW: spec.idleW + (spec.loadW - spec.idleW) * share,
        source: 'spec',
        ...(poe ? { poweredBy: { deviceId: poe.deviceId, interfaceId: poe.interfaceId } } : {}),
      };
    } else if (poe) {
      devices[d.id] = {
        idleW: poe.drawW,
        loadW: poe.drawW,
        expectedW: poe.drawW,
        source: 'poe',
        poweredBy: { deviceId: poe.deviceId, interfaceId: poe.interfaceId },
      };
    } else {
      devices[d.id] = { idleW: 0, loadW: 0, expectedW: 0, source: 'none' };
      unknown.push(d.id);
    }
  }

  const poe: PoeBudget[] = [];
  for (const d of Object.values(p.devices)) {
    const budgetW = d.switching?.poeBudgetW;
    const ports = poeByPse.get(d.id) ?? [];
    if (budgetW === undefined && ports.length === 0) continue;
    const usedW = ports.reduce((sum, port) => sum + port.drawW, 0);
    const ratio = budgetW ? usedW / budgetW : usedW > 0 ? Number.POSITIVE_INFINITY : 0;
    poe.push({
      deviceId: d.id,
      budgetW: budgetW ?? 0,
      usedW,
      ratio,
      status: budgetW === undefined ? 'ok' : usageStatus(ratio, p),
      ports,
    });
  }

  // A UPS protects what stands in its location (rack, shelf or room, with everything inside);
  // an unplaced UPS protects everything no placed UPS covers.
  const upsDevices = Object.values(p.devices).filter((d) => d.kind === 'ups' && d.ups);
  const covered = new Set<Id>();
  const assignments = new Map<Id, Id[]>();
  for (const ups of upsDevices.filter((u) => u.placement)) {
    const at = ups.placement?.locationId;
    const list = Object.values(p.devices)
      .filter(
        (d) =>
          d.id !== ups.id &&
          d.kind !== 'ups' &&
          d.kind !== 'internet' &&
          !poweredBy.has(d.id) &&
          !!at &&
          locationChain(ctx, d.placement?.locationId).includes(at),
      )
      .map((d) => d.id);
    for (const id of list) covered.add(id);
    assignments.set(ups.id, list);
  }
  for (const ups of upsDevices.filter((u) => !u.placement))
    assignments.set(
      ups.id,
      Object.values(p.devices)
        .filter(
          (d) =>
            d.kind !== 'ups' && d.kind !== 'internet' && !poweredBy.has(d.id) && !covered.has(d.id),
        )
        .map((d) => d.id),
    );

  const ups: UpsReport[] = upsDevices.map((u) => {
    const list = assignments.get(u.id) ?? [];
    const protectedSet = new Set(list);
    // PoE devices draw through their switch: they count when the switch is protected.
    const pds = [...poweredBy].filter(([, by]) => protectedSet.has(by.deviceId)).map(([id]) => id);
    const loadW = [...list, ...pds].reduce((sum, id) => sum + (devices[id]?.expectedW ?? 0), 0);
    const capacityW = u.ups?.capacityW ?? 0;
    const ratio = capacityW > 0 ? loadW / capacityW : 0;
    const batteryWh = u.ups?.batteryWh;
    return {
      deviceId: u.id,
      capacityW,
      loadW,
      ratio,
      status: usageStatus(ratio, p),
      ...(batteryWh && loadW > 0
        ? { runtimeMin: ((batteryWh * UPS_EFFICIENCY) / loadW) * 60 }
        : {}),
      protected: list,
    };
  });

  // PoE-powered devices are counted once — through their own figure, not the switch's.
  const all = Object.values(devices);
  const totalIdleW = all.reduce((sum, d) => sum + d.idleW, 0);
  const totalExpectedW = all.reduce((sum, d) => sum + d.expectedW, 0);
  const monthlyKwh = (totalExpectedW * HOURS_PER_MONTH) / 1000;
  const price = p.settings.energyPrice;
  return {
    devices,
    totalIdleW,
    totalExpectedW,
    monthlyKwh,
    ...(price
      ? { monthlyCost: { amount: monthlyKwh * price.perKwh, currency: price.currency } }
      : {}),
    poe,
    ups,
    unknown,
  };
}
