import type { Device, DeviceKind, Disk, Id } from '@server-planner/model';

/**
 * CAP-07 power from components (D14). No open source with a redistributable licence gives the
 * draw of parts, so CPUs and GPUs use their catalog TDP and the rest typical values per class —
 * an estimate (shown "≈"), never a measurement. A spec of the device (from its catalog model or
 * entered by hand) stays the basis; parts added beyond the model's own configuration add to it.
 */

export interface PowerRange {
  idleW: number;
  loadW: number;
}

/** Board, fans, chipset and power supply losses per device kind (without CPU, RAM, disks). */
export const PLATFORM_W: Record<DeviceKind, PowerRange> = {
  internet: { idleW: 0, loadW: 0 },
  modem: { idleW: 6, loadW: 10 },
  router: { idleW: 8, loadW: 15 },
  firewall: { idleW: 10, loadW: 20 },
  switch: { idleW: 8, loadW: 15 },
  'access-point': { idleW: 5, loadW: 12 },
  server: { idleW: 35, loadW: 60 },
  'mini-pc': { idleW: 3, loadW: 6 },
  sbc: { idleW: 1, loadW: 2 },
  nas: { idleW: 8, loadW: 12 },
  ups: { idleW: 8, loadW: 15 },
  'patch-panel': { idleW: 0, loadW: 0 },
  client: { idleW: 0, loadW: 0 },
};

/** A CPU idles at a small share of its TDP and reaches about its TDP under full load. */
export const CPU_IDLE_SHARE = 0.12;
/** TDP assumed for a CPU without one, by device kind. */
const CPU_TDP_DEFAULT: Partial<Record<DeviceKind, number>> = {
  server: 95,
  'mini-pc': 35,
  sbc: 8,
  nas: 15,
};

/** Per module (DIMM / SO-DIMM); soldered memory counts like one module per stated entry. */
export const MEMORY_W: Record<string, PowerRange> = {
  DDR3: { idleW: 1.5, loadW: 3 },
  DDR4: { idleW: 1, loadW: 3 },
  DDR5: { idleW: 1.5, loadW: 4 },
  LPDDR4: { idleW: 0.3, loadW: 1 },
  LPDDR5: { idleW: 0.3, loadW: 1 },
  default: { idleW: 1, loadW: 3 },
};

export const DISK_W: Record<Disk['type'], PowerRange> = {
  hdd: { idleW: 5, loadW: 8 },
  'ssd-sata': { idleW: 0.5, loadW: 3 },
  'ssd-nvme': { idleW: 1.5, loadW: 6 },
  emmc: { idleW: 0.1, loadW: 0.5 },
  sd: { idleW: 0.1, loadW: 0.5 },
};

/** Add-in cards; a NIC adds per port by speed. */
export const CARD_W = {
  nicBase: { idleW: 2, loadW: 3 },
  nicPortBySpeed: [
    { maxMbps: 2500, idleW: 0.5, loadW: 1 },
    { maxMbps: 10000, idleW: 2, loadW: 4 },
    { maxMbps: Number.POSITIVE_INFINITY, idleW: 3, loadW: 6 },
  ],
  hba: { idleW: 7, loadW: 10 },
  other: { idleW: 3, loadW: 5 },
};

/** Discrete GPU / accelerator without a stated TDP; idle share of a known TDP. */
const GPU_TDP_DEFAULT = 75;
const GPU_IDLE_SHARE = 0.1;
const GPU_IDLE_MIN = 2;

export type PowerPartKind = 'platform' | 'cpu' | 'memory' | 'disk' | 'gpu' | 'card';

export interface PowerPart extends PowerRange {
  kind: PowerPartKind;
  /** Model or type, e.g. "Intel Core i5-8500T", "ssd-nvme", "DDR4". */
  label: string;
  count: number;
}

export interface PowerEstimate extends PowerRange {
  /** `estimate`: from parts only; `spec+parts`: the device spec plus parts added beyond the model. */
  basis: 'estimate' | 'spec+parts';
  parts: PowerPart[];
}

/** What a catalog model ships with — parts beyond it add to the model's power spec. */
export interface ModelBaseline {
  power: PowerRange;
  disks: Disk['type'][];
  /** Discrete GPUs / accelerators of the model (iGPUs are part of the CPU). */
  gpus: number;
}

const add = (a: PowerRange, b: PowerRange, n = 1): PowerRange => ({
  idleW: a.idleW + b.idleW * n,
  loadW: a.loadW + b.loadW * n,
});

/** Parts of a device as power figures (all of them, model or not). */
export function powerParts(device: Device): PowerPart[] {
  const hw = device.hardware;
  const parts: PowerPart[] = [];
  const platform = PLATFORM_W[device.kind];
  if (platform.idleW > 0 || platform.loadW > 0)
    parts.push({ kind: 'platform', label: device.kind, count: 1, ...platform });
  for (const cpu of hw.cpus) {
    const tdp = cpu.tdpW ?? CPU_TDP_DEFAULT[device.kind] ?? 15;
    parts.push({
      kind: 'cpu',
      label: cpu.model,
      count: 1,
      idleW: Math.max(1, tdp * CPU_IDLE_SHARE),
      loadW: tdp,
    });
  }
  const memory = MEMORY_W[hw.memory?.type ?? 'default'] ?? MEMORY_W.default;
  const modules = (hw.memory?.modules ?? []).reduce((s, m) => s + m.count, 0);
  if (modules > 0 && memory)
    parts.push({
      kind: 'memory',
      label: hw.memory?.type ?? 'RAM',
      count: modules,
      idleW: memory.idleW * modules,
      loadW: memory.loadW * modules,
    });
  const disks = new Map<Disk['type'], number>();
  for (const d of hw.disks) disks.set(d.type, (disks.get(d.type) ?? 0) + 1);
  for (const [type, count] of disks)
    parts.push({
      kind: 'disk',
      label: type,
      count,
      idleW: DISK_W[type].idleW * count,
      loadW: DISK_W[type].loadW * count,
    });
  for (const gpu of hw.gpus) {
    // A GPU without a slot is the CPU's own iGPU — already in its TDP.
    if (!gpu.attach) continue;
    const tdp = gpu.tdpW ?? (gpu.attach === 'pcie' ? GPU_TDP_DEFAULT : 5);
    parts.push({
      kind: 'gpu',
      label: gpu.model,
      count: 1,
      idleW: Math.max(Math.min(GPU_IDLE_MIN, tdp), tdp * GPU_IDLE_SHARE),
      loadW: tdp,
    });
  }
  for (const card of hw.cards ?? []) {
    const range: PowerRange =
      card.kind === 'hba' ? CARD_W.hba : card.kind === 'other' ? CARD_W.other : CARD_W.nicBase;
    parts.push({ kind: 'card', label: card.model, count: 1, ...range });
  }
  return parts;
}

/** Adds NIC port power once the speeds of the card ports are known. */
export function nicPortPower(speeds: (number | undefined)[]): PowerRange {
  return speeds.reduce<PowerRange>(
    (sum, speed) => {
      const tier =
        CARD_W.nicPortBySpeed.find((t) => (speed ?? 1000) <= t.maxMbps) ??
        CARD_W.nicPortBySpeed[CARD_W.nicPortBySpeed.length - 1];
      return tier ? add(sum, tier) : sum;
    },
    { idleW: 0, loadW: 0 },
  );
}

const total = (parts: PowerPart[]): PowerRange =>
  parts.reduce<PowerRange>((s, p) => ({ idleW: s.idleW + p.idleW, loadW: s.loadW + p.loadW }), {
    idleW: 0,
    loadW: 0,
  });

const round = (r: PowerRange): PowerRange => ({
  idleW: Math.round(r.idleW * 10) / 10,
  loadW: Math.round(r.loadW * 10) / 10,
});

/**
 * The power of a device from its parts. With a spec from its catalog model (unchanged), only the
 * parts beyond the model are added; a spec entered by hand (or changed) is the whole figure and
 * no estimate is made (undefined).
 */
export function estimatePower(
  device: Device,
  cardPorts: (cardId: Id) => (number | undefined)[],
  baseline: ModelBaseline | undefined,
): PowerEstimate | undefined {
  const parts = powerParts(device);
  // NIC ports by speed.
  for (const card of device.hardware.cards ?? [])
    if (card.kind === 'nic') {
      const part = parts.find((p) => p.kind === 'card' && p.label === card.model);
      if (part) Object.assign(part, add(part, nicPortPower(cardPorts(card.id))));
    }
  const spec = device.hardware.power;
  if (!spec)
    return parts.length > 0 ? { ...round(total(parts)), basis: 'estimate', parts } : undefined;
  const fromModel =
    baseline && baseline.power.idleW === spec.idleW && baseline.power.loadW === spec.loadW;
  if (!fromModel || !baseline) return undefined;
  // Parts beyond the model: cards, discrete GPUs past the model's own, disks past its defaults.
  const extra: PowerPart[] = [];
  for (const p of parts) if (p.kind === 'card') extra.push(p);
  const gpus = parts.filter((p) => p.kind === 'gpu').slice(baseline.gpus);
  extra.push(...gpus);
  const defaults = new Map<Disk['type'], number>();
  for (const t of baseline.disks) defaults.set(t, (defaults.get(t) ?? 0) + 1);
  for (const p of parts.filter((x) => x.kind === 'disk')) {
    const beyond = p.count - (defaults.get(p.label as Disk['type']) ?? 0);
    if (beyond > 0) {
      const each = DISK_W[p.label as Disk['type']];
      extra.push({ ...p, count: beyond, idleW: each.idleW * beyond, loadW: each.loadW * beyond });
    }
  }
  if (extra.length === 0) return undefined;
  const sum = total(extra);
  return {
    ...round({ idleW: spec.idleW + sum.idleW, loadW: spec.loadW + sum.loadW }),
    basis: 'spec+parts',
    parts: extra,
  };
}
