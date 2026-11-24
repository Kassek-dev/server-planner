import { cableLabel, type Project } from '@server-planner/model';

/**
 * LBL-04 label sheets: cable and device labels laid out on A4 sheets of self-adhesive labels.
 * Sizes in millimetres; the grid is centred on the page.
 */

export interface SheetPreset {
  id: string;
  /** Label width × height, mm. */
  w: number;
  h: number;
  cols: number;
  rows: number;
  /** Gaps between labels, mm. */
  gapX: number;
  gapY: number;
}

export const A4 = { w: 210, h: 297 } as const;

/** Common A4 label layouts (dimensions only — any brand with the same grid fits). */
export const SHEET_PRESETS: SheetPreset[] = [
  { id: '70x37', w: 70, h: 37, cols: 3, rows: 8, gapX: 0, gapY: 0 },
  { id: '63.5x38.1', w: 63.5, h: 38.1, cols: 3, rows: 7, gapX: 2.5, gapY: 0 },
  { id: '48.5x25.4', w: 48.5, h: 25.4, cols: 4, rows: 10, gapX: 0, gapY: 0 },
  { id: '38.1x21.2', w: 38.1, h: 21.2, cols: 5, rows: 13, gapX: 0, gapY: 0 },
];

export interface LabelContent {
  /** Main line. */
  title: string;
  /** Second line (address, model, other end), may be empty. */
  detail: string;
  /** 1.10: cable labels can be printed as flags. */
  kind?: 'cable' | 'device';
}

export interface LabelOptions {
  cables: boolean;
  /** Each cable twice — one label for each end. */
  bothEnds: boolean;
  devices: boolean;
}

/** Labels of the project: cables (stored label or the project pattern) and devices. */
export function projectLabels(project: Project, options: LabelOptions): LabelContent[] {
  const labels: LabelContent[] = [];
  if (options.devices) {
    const address = (deviceId: string) =>
      Object.values(project.interfaces)
        .filter((i) => i.owner.type === 'device' && i.owner.id === deviceId)
        .flatMap((i) => i.addresses.map((a) => a.address))
        .find((a): a is string => Boolean(a)) ?? '';
    for (const d of Object.values(project.devices)
      .filter((x) => x.kind !== 'internet')
      .sort((a, b) => a.name.localeCompare(b.name)))
      labels.push({ title: d.physicalLabel || d.name, detail: address(d.id), kind: 'device' });
  }
  if (options.cables) {
    const pattern = project.settings.cableLabelPattern;
    const cables = Object.values(project.links)
      .filter((l) => l.medium !== 'virtual' && l.medium !== 'wifi')
      .map((l) => ({
        title: l.cable?.label || cableLabel(project, l, pattern),
        detail: [l.cable?.category?.toUpperCase(), l.cable?.lengthM ? `${l.cable.lengthM} m` : '']
          .filter(Boolean)
          .join(' · '),
        kind: 'cable' as const,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
    for (const c of cables) labels.push(...(options.bothEnds ? [c, c] : [c]));
  }
  return labels;
}

export interface PlacedLabel extends LabelContent {
  x: number;
  y: number;
  /** Size of this label, mm. */
  w: number;
  h: number;
  /** 1.10: a cable flag — the text twice with a wrap zone between the halves. */
  flag?: boolean;
}

/**
 * Labels placed on sheets. `skip` leaves the first labels of the first sheet empty (a partly used
 * sheet); positions are in mm from the top left of the page.
 */
export function layoutSheets(
  labels: LabelContent[],
  preset: SheetPreset,
  skip = 0,
  /** 1.10: cable labels as flags. */
  flag = false,
): PlacedLabel[][] {
  const perSheet = preset.cols * preset.rows;
  const start = Math.min(Math.max(0, Math.floor(skip)), perSheet - 1);
  const gridW = preset.cols * preset.w + (preset.cols - 1) * preset.gapX;
  const gridH = preset.rows * preset.h + (preset.rows - 1) * preset.gapY;
  const left = (A4.w - gridW) / 2;
  const top = (A4.h - gridH) / 2;
  const sheets: PlacedLabel[][] = [];
  labels.forEach((label, i) => {
    const slot = start + i;
    const sheet = Math.floor(slot / perSheet);
    const cell = slot % perSheet;
    const col = cell % preset.cols;
    const row = Math.floor(cell / preset.cols);
    sheets[sheet] ??= [];
    sheets[sheet].push({
      ...label,
      x: left + col * (preset.w + preset.gapX),
      y: top + row * (preset.h + preset.gapY),
      w: preset.w,
      h: preset.h,
      ...(flag && label.kind === 'cable' ? { flag: true } : {}),
    });
  });
  return sheets;
}

/** LBL-04 (1.10) label tape widths (Brother P-touch / Dymo class printers), mm. */
export const TAPE_WIDTHS = [12, 18, 24] as const;
/** Cable flag: the part that wraps around the cable, between the two halves, mm. */
export const FLAG_WRAP = 15;
const TAPE_MARGIN = 3;
const MIN_TAPE_LABEL = 20;

/** Title font on a tape of this width, mm (one line plus a smaller detail line). */
export const tapeFont = (tapeMm: number) => tapeMm * 0.4;

/** Length of one label on tape: the text plus margins (a flag: twice plus the wrap). */
export function tapeLength(label: LabelContent, tapeMm: number, flag: boolean): number {
  const chars = Math.max(label.title.length, Math.ceil(label.detail.length * 0.75));
  const half = Math.max(MIN_TAPE_LABEL, chars * tapeFont(tapeMm) * 0.6 + 2 * TAPE_MARGIN);
  return Math.round((flag && label.kind === 'cable' ? 2 * half + FLAG_WRAP : half) * 10) / 10;
}

/**
 * Tape labels on A4 pages for printing or reference: rows of labels, as long as their text, packed
 * left to right inside 10 mm margins.
 */
export function layoutTape(labels: LabelContent[], tapeMm: number, flag: boolean): PlacedLabel[][] {
  const pages: PlacedLabel[][] = [];
  const margin = 10;
  const gap = 3;
  let page: PlacedLabel[] = [];
  let x = margin;
  let y = margin;
  for (const label of labels) {
    const w = Math.min(A4.w - 2 * margin, tapeLength(label, tapeMm, flag));
    if (x + w > A4.w - margin) {
      x = margin;
      y += tapeMm + gap;
    }
    if (y + tapeMm > A4.h - margin) {
      pages.push(page);
      page = [];
      x = margin;
      y = margin;
    }
    page.push({
      ...label,
      x,
      y,
      w,
      h: tapeMm,
      ...(flag && label.kind === 'cable' ? { flag: true } : {}),
    });
    x += w + gap;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

/** The whole tape as one strip — labels end to end — for a label printer's own software. */
export function tapeStrip(
  labels: LabelContent[],
  tapeMm: number,
  flag: boolean,
): {
  labels: PlacedLabel[];
  length: number;
} {
  let x = 0;
  const placed = labels.map((label) => {
    const w = tapeLength(label, tapeMm, flag);
    const p: PlacedLabel = {
      ...label,
      x,
      y: 0,
      w,
      h: tapeMm,
      ...(flag && label.kind === 'cable' ? { flag: true } : {}),
    };
    x += w;
    return p;
  });
  return { labels: placed, length: x };
}
