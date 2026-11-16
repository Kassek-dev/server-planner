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
      labels.push({ title: d.physicalLabel || d.name, detail: address(d.id) });
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
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
    for (const c of cables) labels.push(...(options.bothEnds ? [c, c] : [c]));
  }
  return labels;
}

export interface PlacedLabel extends LabelContent {
  x: number;
  y: number;
}

/**
 * Labels placed on sheets. `skip` leaves the first labels of the first sheet empty (a partly used
 * sheet); positions are in mm from the top left of the page.
 */
export function layoutSheets(
  labels: LabelContent[],
  preset: SheetPreset,
  skip = 0,
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
    });
  });
  return sheets;
}
