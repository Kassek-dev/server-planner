import { Download, Printer } from 'lucide-react';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { useSession } from '../../app/services';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { Select } from '../../ui/Select';
import { TextField } from '../../ui/TextField';
import {
  A4,
  FLAG_WRAP,
  layoutSheets,
  layoutTape,
  type PlacedLabel,
  projectLabels,
  SHEET_PRESETS,
  TAPE_WIDTHS,
  tapeStrip,
} from './sheet';

/** The SVG as a standalone file: design tokens replaced by their computed values. */
function svgFile(svg: SVGSVGElement): string {
  const style = getComputedStyle(svg);
  return svg.outerHTML.replace(/var\((--[\w-]+)\)/g, (_, name: string) =>
    style.getPropertyValue(name).trim(),
  );
}

export const useLabelsDialog = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Font size (mm) that fits `text` across `width` in a monospace face, capped by `max`. */
const fit = (text: string, width: number, max: number) =>
  Math.max(1.8, Math.min(max, width / (Math.max(1, text.length) * 0.6)));

/** The text block of one label (or one half of a flag) inside a box, mm. */
function LabelText({
  label: l,
  x,
  y,
  w,
  h,
  rotate,
}: {
  label: PlacedLabel;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: boolean;
}) {
  const pad = Math.min(3, h * 0.1);
  const width = w - 2 * pad;
  const max = h * 0.3;
  // A long cable label reads better split at the arrow, one end per line.
  const split = l.title.includes(' ↔ ') ? l.title.split(/(?<=↔) /) : [l.title];
  const one = fit(l.title, width, max);
  const two = Math.min(max * 0.75, ...split.map((line) => fit(line, width, max)));
  const lines = split.length > 1 && two > one * 1.3 ? split : [l.title];
  const title = lines.length > 1 ? two : one;
  const detail = l.detail ? fit(l.detail, width, title * 0.75) : 0;
  const block = title * 1.2 * lines.length + (detail ? detail * 1.3 : 0);
  const top = y + (h - block) / 2 + title * 0.9;
  const cx = x + w / 2;
  return (
    // A flag's second half is turned around, so both sides read upright once folded.
    <g transform={rotate ? `rotate(180 ${cx} ${y + h / 2})` : undefined}>
      <text
        x={cx}
        y={top}
        textAnchor="middle"
        fontSize={title}
        fontWeight={600}
        fill="var(--sp-text-primary)"
      >
        {lines.map((line, i) => (
          <tspan key={line} x={cx} dy={i === 0 ? 0 : title * 1.2}>
            {line}
          </tspan>
        ))}
      </text>
      {l.detail ? (
        <text
          x={cx}
          y={top + title * 1.2 * (lines.length - 1) + detail * 1.3}
          textAnchor="middle"
          fontSize={detail}
          fill="var(--sp-text-secondary)"
        >
          {l.detail}
        </text>
      ) : null}
    </g>
  );
}

/** One label: plain, or a cable flag (two halves around a wrap zone). */
function LabelShape({ label: l, outline }: { label: PlacedLabel; outline: boolean }) {
  const half = l.flag ? (l.w - FLAG_WRAP) / 2 : l.w;
  return (
    <g>
      {outline ? (
        <rect
          x={l.x}
          y={l.y}
          width={l.w}
          height={l.h}
          rx={1.5}
          fill="none"
          stroke="var(--sp-border-subtle)"
          strokeWidth={0.3}
        />
      ) : null}
      <LabelText label={l} x={l.x} y={l.y} w={half} h={l.h} />
      {l.flag ? (
        <>
          {[l.x + half, l.x + half + FLAG_WRAP].map((fx) => (
            <line
              key={fx}
              x1={fx}
              y1={l.y}
              x2={fx}
              y2={l.y + l.h}
              stroke="var(--sp-border-strong)"
              strokeWidth={0.25}
              strokeDasharray="1 1"
            />
          ))}
          <LabelText label={l} x={l.x + half + FLAG_WRAP} y={l.y} w={half} h={l.h} rotate />
        </>
      ) : null}
    </g>
  );
}

/** One A4 page of labels (sheet or tape rows), drawn in millimetres. */
function Sheet({
  labels,
  outline,
  label,
}: {
  labels: PlacedLabel[];
  outline: boolean;
  label: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${A4.w} ${A4.h}`}
      role="img"
      aria-label={label}
      fontFamily="var(--sp-font-mono)"
    >
      <rect width={A4.w} height={A4.h} fill="var(--sp-bg-panel)" />
      {labels.map((l) => (
        <LabelShape key={`${l.x}:${l.y}`} label={l} outline={outline} />
      ))}
    </svg>
  );
}

/** The tape as one strip, labels end to end with cut marks — for a label printer's software. */
function TapeStrip({
  labels,
  length,
  tape,
  ref,
}: {
  labels: PlacedLabel[];
  length: number;
  tape: number;
  ref: React.Ref<SVGSVGElement>;
}) {
  return (
    <svg
      ref={ref}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width={`${length}mm`}
      height={`${tape}mm`}
      viewBox={`0 0 ${length} ${tape}`}
      fontFamily="var(--sp-font-mono)"
    >
      <rect width={length} height={tape} fill="var(--sp-bg-panel)" />
      {labels.map((l) => (
        <LabelShape key={l.x} label={l} outline />
      ))}
    </svg>
  );
}

/**
 * D-17 Print labels (LBL-04): cable and device labels on an A4 sheet of self-adhesive labels,
 * printed through the browser (or saved as PDF from its print dialog).
 */
export function LabelsDialog() {
  const { t } = useTranslation('editor');
  const open = useLabelsDialog((s) => s.open);
  const project = useSession((s) => s.project);
  const [presetId, setPresetId] = useState(SHEET_PRESETS[0]?.id ?? '');
  const [cables, setCables] = useState(true);
  const [bothEnds, setBothEnds] = useState(true);
  const [devices, setDevices] = useState(true);
  const [skip, setSkip] = useState(0);
  const [tape, setTape] = useState(0);
  const [flags, setFlags] = useState(false);
  const strip = useRef<SVGSVGElement>(null);
  if (!open || !project) return null;
  const preset = SHEET_PRESETS.find((p) => p.id === presetId) ?? SHEET_PRESETS[0];
  if (!preset) return null;
  const labels = projectLabels(project, { cables, bothEnds, devices });
  // LBL-04 (1.10): a label tape (0 = an A4 sheet of labels); cable labels as flags.
  const flag = cables && flags;
  const sheets =
    tape > 0 ? layoutTape(labels, tape, flag) : layoutSheets(labels, preset, skip, flag);
  const tapeLabels = tape > 0 ? tapeStrip(labels, tape, flag) : undefined;
  const download = () => {
    if (!strip.current) return;
    const url = URL.createObjectURL(new Blob([svgFile(strip.current)], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'labels'}-tape-${tape}mm.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const perSheet = preset.cols * preset.rows;
  const close = () => useLabelsDialog.getState().setOpen(false);
  const print = () => {
    // index.css prints only [data-print-pages] while the body carries this class.
    document.body.classList.add('sp-print-pages');
    window.print();
    document.body.classList.remove('sp-print-pages');
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && close()}
      title={t('labels.title')}
      description={t('labels.description')}
      closeLabel={t('labels.close')}
      width={640}
      footer={
        <>
          {tapeLabels ? (
            <Button
              disabled={labels.length === 0}
              icon={<Download size={14} aria-hidden="true" />}
              onClick={download}
            >
              {t('labels.download')}
            </Button>
          ) : null}
          <Button
            variant="primary"
            disabled={labels.length === 0}
            icon={<Printer size={14} aria-hidden="true" />}
            onClick={print}
          >
            {t('labels.print', { count: sheets.length })}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_240px] gap-4 max-md:grid-cols-1">
        <div className="flex flex-col gap-3">
          <Select
            label={t('labels.format')}
            value={String(tape)}
            onChange={(e) => setTape(Number(e.target.value))}
            options={[
              { value: '0', label: t('labels.formatSheet') },
              ...TAPE_WIDTHS.map((w) => ({
                value: String(w),
                label: t('labels.formatTape', { w }),
              })),
            ]}
          />
          {tape > 0 ? null : (
            <Select
              label={t('labels.sheet')}
              value={preset.id}
              onChange={(e) => setPresetId(e.target.value)}
              options={SHEET_PRESETS.map((p) => ({
                value: p.id,
                label: t('labels.preset', {
                  w: p.w,
                  h: p.h,
                  cols: p.cols,
                  rows: p.rows,
                  count: p.cols * p.rows,
                }),
              }))}
            />
          )}
          <Checkbox
            label={t('labels.cables')}
            checked={cables}
            onChange={(e) => setCables(e.target.checked)}
          />
          <div className="pl-5">
            <Checkbox
              label={t('labels.bothEnds')}
              checked={bothEnds}
              disabled={!cables}
              onChange={(e) => setBothEnds(e.target.checked)}
            />
            <Checkbox
              label={t('labels.flags', { wrap: FLAG_WRAP })}
              checked={flags}
              disabled={!cables}
              onChange={(e) => setFlags(e.target.checked)}
            />
          </div>
          <Checkbox
            label={t('labels.devices')}
            checked={devices}
            onChange={(e) => setDevices(e.target.checked)}
          />
          {tape > 0 ? null : (
            <TextField
              label={t('labels.skip')}
              type="number"
              min={0}
              max={perSheet - 1}
              value={skip}
              onChange={(e) =>
                setSkip(Math.min(perSheet - 1, Math.max(0, Number(e.target.value) || 0)))
              }
            />
          )}
          <p className="m-0 text-body-sm text-text-secondary" aria-live="polite">
            {labels.length === 0
              ? t('labels.none')
              : tapeLabels
                ? t('labels.tapeSummary', {
                    labels: labels.length,
                    length: Math.round(tapeLabels.length / 10),
                  })
                : t('labels.summary', { labels: labels.length, sheets: sheets.length })}
          </p>
        </div>
        <div className="rounded-md border border-border-subtle bg-inset p-2">
          <Sheet labels={sheets[0] ?? []} outline label={t('labels.preview')} />
        </div>
      </div>
      {createPortal(
        <div data-print-pages data-theme="light">
          {sheets.map((sheet, i) => (
            <Sheet
              // biome-ignore lint/suspicious/noArrayIndexKey: pages in order
              key={i}
              labels={sheet}
              // Tape rows on paper keep their outlines, as cut lines.
              outline={tape > 0}
              label={t('labels.page', { page: i + 1 })}
            />
          ))}
        </div>,
        document.body,
      )}
      {tapeLabels ? (
        <div hidden data-theme="light">
          <TapeStrip
            ref={strip}
            labels={tapeLabels.labels}
            length={tapeLabels.length}
            tape={tape}
          />
        </div>
      ) : null}
    </Dialog>
  );
}
