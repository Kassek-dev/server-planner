import { useTranslation } from 'react-i18next';
import { Select } from '../../ui/Select';
import { type DeviceColoring, type LinkColoring, SPEED_CLASSES, useCanvasView } from './overlays';

/** O-11 canvas controls: "Color by" for links and devices (CAN-06) with a legend for speeds. */
export function OverlayControls() {
  const { t } = useTranslation('canvas');
  const { links, devices, set } = useCanvasView();
  return (
    <div className="absolute top-4 right-4 flex w-52 flex-col gap-2 rounded-md border border-border-default bg-raised p-2.5">
      <Select
        label={t('overlay.links')}
        value={links}
        onChange={(e) => set({ links: e.target.value as LinkColoring })}
        options={(['type', 'speed'] as const).map((v) => ({
          value: v,
          label: t(`overlay.linkOptions.${v}`),
        }))}
      />
      <Select
        label={t('overlay.devices')}
        value={devices}
        onChange={(e) => set({ devices: e.target.value as DeviceColoring })}
        options={(['none', 'zone', 'tag', 'capacity'] as const).map((v) => ({
          value: v,
          label: t(`overlay.deviceOptions.${v}`),
        }))}
      />
      {links === 'speed' ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm text-text-secondary">
          {SPEED_CLASSES.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block w-5"
                style={{ height: c.width, background: c.stroke }}
              />
              {t(`overlay.speed.${c.id}`)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
