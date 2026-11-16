import { Printer } from 'lucide-react';
import { useState } from 'react';
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
  layoutSheets,
  type PlacedLabel,
  projectLabels,
  SHEET_PRESETS,
  type SheetPreset,
} from './sheet';

export const useLabelsDialog = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Font size (mm) that fits `text` across `width` in a monospace face, capped by `max`. */
const fit = (text: string, width: number, max: number) =>
  Math.max(1.8, Math.min(max, width / (Math.max(1, text.length) * 0.6)));

/** One A4 page of labels, drawn in millimetres. */
function Sheet({
  labels,
  preset,
  outline,
  label,
}: {
  labels: PlacedLabel[];
  preset: SheetPreset;
  outline: boolean;
  label: string;
}) {
  const pad = Math.min(3, preset.h * 0.1);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${A4.w} ${A4.h}`}
      role="img"
      aria-label={label}
      fontFamily="var(--sp-font-mono)"
    >
      <rect width={A4.w} height={A4.h} fill="var(--sp-bg-panel)" />
      {labels.map((l) => {
        const width = preset.w - 2 * pad;
        const max = preset.h * 0.3;
        // A long cable label reads better split at the arrow, one end per line.
        const split = l.title.includes(' ↔ ') ? l.title.split(/(?<=↔) /) : [l.title];
        const one = fit(l.title, width, max);
        const two = Math.min(max * 0.75, ...split.map((line) => fit(line, width, max)));
        const lines = split.length > 1 && two > one * 1.3 ? split : [l.title];
        const title = lines.length > 1 ? two : one;
        const detail = l.detail ? fit(l.detail, width, title * 0.75) : 0;
        const block = title * 1.2 * lines.length + (detail ? detail * 1.3 : 0);
        const top = l.y + (preset.h - block) / 2 + title * 0.9;
        return (
          <g key={`${l.x}:${l.y}`}>
            {outline ? (
              <rect
                x={l.x}
                y={l.y}
                width={preset.w}
                height={preset.h}
                rx={1.5}
                fill="none"
                stroke="var(--sp-border-subtle)"
                strokeWidth={0.3}
              />
            ) : null}
            <text
              x={l.x + preset.w / 2}
              y={top}
              textAnchor="middle"
              fontSize={title}
              fontWeight={600}
              fill="var(--sp-text-primary)"
            >
              {lines.map((line, i) => (
                <tspan key={line} x={l.x + preset.w / 2} dy={i === 0 ? 0 : title * 1.2}>
                  {line}
                </tspan>
              ))}
            </text>
            {l.detail ? (
              <text
                x={l.x + preset.w / 2}
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
      })}
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
  if (!open || !project) return null;
  const preset = SHEET_PRESETS.find((p) => p.id === presetId) ?? SHEET_PRESETS[0];
  if (!preset) return null;
  const labels = projectLabels(project, { cables, bothEnds, devices });
  const sheets = layoutSheets(labels, preset, skip);
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
        <Button
          variant="primary"
          disabled={labels.length === 0}
          icon={<Printer size={14} aria-hidden="true" />}
          onClick={print}
        >
          {t('labels.print', { count: sheets.length })}
        </Button>
      }
    >
      <div className="grid grid-cols-[1fr_240px] gap-4 max-md:grid-cols-1">
        <div className="flex flex-col gap-3">
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
          </div>
          <Checkbox
            label={t('labels.devices')}
            checked={devices}
            onChange={(e) => setDevices(e.target.checked)}
          />
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
          <p className="m-0 text-body-sm text-text-secondary" aria-live="polite">
            {labels.length === 0
              ? t('labels.none')
              : t('labels.summary', { labels: labels.length, sheets: sheets.length })}
          </p>
        </div>
        <div className="rounded-md border border-border-subtle bg-inset p-2">
          <Sheet labels={sheets[0] ?? []} preset={preset} outline label={t('labels.preview')} />
        </div>
      </div>
      {createPortal(
        <div data-print-pages data-theme="light">
          {sheets.map((sheet, i) => (
            <Sheet
              // biome-ignore lint/suspicious/noArrayIndexKey: pages in order
              key={i}
              labels={sheet}
              preset={preset}
              outline={false}
              label={t('labels.page', { page: i + 1 })}
            />
          ))}
        </div>,
        document.body,
      )}
    </Dialog>
  );
}
