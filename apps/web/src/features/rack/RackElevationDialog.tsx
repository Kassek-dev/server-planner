import type { Project } from '@server-planner/model';
import { Download, Printer } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadBlob } from '../../app/download';
import { catalogDevice, useCatalog } from '../../catalog/store';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { modelName } from '../catalog/DeviceModelPicker';
import { downloadDataUrl } from '../export/image';
import { rackElevation } from './elevation';
import {
  cssColors,
  type ElevationColors,
  elevationSize,
  RackElevation,
  TOKEN_COLORS,
} from './RackElevation';

/** Token values of the light theme — files and prints are drawn for paper. */
function lightColors(): ElevationColors {
  const probe = document.createElement('div');
  probe.dataset.theme = 'light';
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const colors = Object.fromEntries(
    Object.entries(TOKEN_COLORS).map(([key, token]) => [key, style.getPropertyValue(token).trim()]),
  ) as unknown as ElevationColors;
  probe.remove();
  return colors;
}

/** The same drawing with resolved colours, as a standalone SVG document. */
function svgMarkup(svg: SVGSVGElement): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const colors = lightColors();
  // Swap var(--sp-…) references for their light-theme values.
  const swap = (value: string | null) =>
    value?.replace(/var\((--sp-[a-z0-9-]+)\)/g, (_, token: string) => {
      const key = (Object.keys(TOKEN_COLORS) as (keyof ElevationColors)[]).find(
        (k) => TOKEN_COLORS[k] === token,
      );
      return key ? colors[key] : 'currentColor';
    }) ?? null;
  for (const el of [copy, ...copy.querySelectorAll('*')])
    for (const attr of ['fill', 'stroke', 'font-family']) {
      const value = swap(el.getAttribute(attr));
      if (value !== null) el.setAttribute(attr, value);
    }
  copy.removeAttribute('class');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}`;
}

async function pngFrom(markup: string, width: number, height: number): Promise<string> {
  const scale = 3; // px per mm — sharp when printed
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** D-16 Rack elevation (LOC-09): front view of a rack — download as SVG / PNG, or print. */
export function RackElevationDialog({
  project,
  rackId,
  onClose,
}: {
  project: Project;
  rackId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('inspector');
  const catalog = useCatalog((s) => s.catalog);
  const svg = useRef<SVGSVGElement>(null);
  const elevation = rackElevation(project, rackId, (id) => {
    const device = project.devices[id];
    const model = device?.catalogRef ? catalogDevice(catalog, device.catalogRef.id) : undefined;
    return model ? modelName(model) : device ? t(`deviceKind.${device.kind}`) : '';
  });
  if (!elevation) return null;
  const file = elevation.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'rack';
  const { width, height } = elevationSize(elevation);

  const downloadSvg = () => {
    if (svg.current)
      downloadBlob(
        new Blob([svgMarkup(svg.current)], { type: 'image/svg+xml' }),
        `${file}-elevation.svg`,
      );
  };
  const downloadPng = async () => {
    if (svg.current)
      downloadDataUrl(
        await pngFrom(svgMarkup(svg.current), width, height),
        `${file}-elevation.png`,
      );
  };
  const print = () => {
    // index.css prints only [data-print-area] while the body carries this class.
    document.body.classList.add('sp-printing');
    window.print();
    document.body.classList.remove('sp-printing');
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('elevation.title', { name: elevation.name })}
      description={t('elevation.description', {
        free: elevation.freeUnits,
        total: elevation.units,
      })}
      closeLabel={t('elevation.close')}
      width={640}
      footer={
        <>
          <Button icon={<Download size={14} aria-hidden="true" />} onClick={downloadSvg}>
            {t('elevation.svg')}
          </Button>
          <Button
            icon={<Download size={14} aria-hidden="true" />}
            onClick={() => void downloadPng()}
          >
            {t('elevation.png')}
          </Button>
          <Button variant="primary" icon={<Printer size={14} aria-hidden="true" />} onClick={print}>
            {t('elevation.print')}
          </Button>
        </>
      }
    >
      <div data-print-area>
        <RackElevation
          ref={svg}
          elevation={elevation}
          colors={cssColors}
          label={t('elevation.label', { name: elevation.name })}
          freeLabel={(n) => t('elevation.free', { count: n })}
        />
      </div>
    </Dialog>
  );
}
