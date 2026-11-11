import { Handle, type Node, type NodeProps, Position, useStore } from '@xyflow/react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../app/services';
import { DeviceIcon } from '../../../icons/devices';
import { useResults } from '../../../store/results';
import { Led } from '../../../ui/Led';
import { SegmentBar } from '../../../ui/SegmentBar';
import type { DeviceNodeData, PortView } from '../graph';

/** DeviceTile — docs/04 § 6.7. Shape encodes form factor; selection = 2 px `selection` border. */

const OS_LABELS: Record<string, string> = {
  'proxmox-ve': 'Proxmox VE',
  debian: 'Debian',
  'ubuntu-server': 'Ubuntu Server',
  'windows-server': 'Windows Server',
};

const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

function Ports({ ports, compact = false }: { ports: PortView[]; compact?: boolean }) {
  if (ports.length === 0) return null;
  if (ports.length > 16) {
    const used = ports.filter((p) => p.state !== 'free').length;
    return (
      <span className="font-mono text-data-sm text-text-secondary">{`${used}/${ports.length}`}</span>
    );
  }
  return (
    <span className="flex flex-wrap gap-[3px]" aria-hidden="true">
      {ports.map((port) => (
        <span
          key={port.id}
          title={port.name}
          className="rounded-xs"
          style={{
            width: compact ? 11 : 14,
            height: compact ? 9 : 12,
            background:
              port.state === 'free'
                ? 'var(--sp-port-empty)'
                : port.state === 'wan'
                  ? 'var(--sp-port-wan)'
                  : port.state === 'trunk'
                    ? 'var(--sp-port-trunk)'
                    : port.state === 'wifi'
                      ? 'var(--sp-status-info)'
                      : port.color,
          }}
        />
      ))}
    </span>
  );
}

/** Four connection points; links pick the sides facing each other (graph.ts). */
const handles = (
  <>
    {(
      [
        ['t', Position.Top],
        ['r', Position.Right],
        ['b', Position.Bottom],
        ['l', Position.Left],
      ] as const
    ).map(([id, position]) => (
      <Handle
        key={id}
        id={id}
        type="source"
        position={position}
        className="!size-2 !border-0 !bg-border-strong"
      />
    ))}
  </>
);

/** Status LED of a device from the engines (docs/04 § 6.4); hidden until analysed. */
function StatusLed({ id, size = 8 }: { id: string; size?: 7 | 8 }) {
  const { t } = useTranslation('canvas');
  const status = useResults((s) => s.result?.deviceStatus[id]);
  if (!status) return null;
  return <Led status={status} size={size} label={t(`status.${status}`)} />;
}

/** 10-segment RAM bar on host tiles (docs/04 § 6.7). */
function MemoryBar({ id }: { id: string }) {
  const { t } = useTranslation('canvas');
  const memory = useResults((s) => s.result?.capacity[id]?.memory);
  const thresholds = useSession((s) => s.project?.settings.capacityThresholds);
  if (!memory || !thresholds || memory.capacity === 0) return null;
  const percent = Math.round(memory.ratio * 100);
  return (
    <span className="flex items-center gap-2 px-2.5 pb-1.5">
      <span className="font-mono text-data-sm text-text-secondary">RAM</span>
      <span className="flex-1">
        <SegmentBar
          ratio={memory.ratio}
          segments={10}
          height={5}
          label={t('status.memory', { percent })}
          {...thresholds}
        />
      </span>
      <span className="font-mono text-data-sm text-text-secondary">{`${percent}%`}</span>
    </span>
  );
}

export const DeviceNode = memo(function DeviceNode({
  data,
  selected,
}: NodeProps<Node<DeviceNodeData, 'device'>>) {
  const { t } = useTranslation('canvas');
  const zoom = useStore(zoomSelector);
  const { device, variant, ports } = data;
  const detailed = zoom >= 0.6;
  const border = selected ? 'border-2 border-selection' : 'border border-border-default';
  const meta = device.os
    ? `${OS_LABELS[device.os.osId] ?? device.os.osId} ${device.os.version}`
    : t(`deviceKind.${device.kind}`);

  if (variant === 'shelf-chip') {
    return (
      <div
        className={`flex h-full items-center gap-1.5 rounded-md bg-tile px-1.5 font-mono text-data-sm ${border}`}
      >
        {handles}
        <span className="truncate">{device.name}</span>
      </div>
    );
  }

  if (variant === 'rack-row') {
    return (
      <div className={`flex h-full items-center gap-2 rounded-sm bg-tile px-2 ${border}`}>
        {handles}
        <StatusLed id={device.id} size={7} />
        <span className="truncate text-body-sm font-semibold">{device.name}</span>
        {detailed ? (
          <span className="truncate font-mono text-data-sm text-text-secondary">{meta}</span>
        ) : null}
        <span className="ml-auto">{detailed ? <Ports ports={ports} compact /> : null}</span>
      </div>
    );
  }

  if (device.kind === 'internet') {
    return (
      <div
        className={`flex h-full items-center justify-center gap-2 rounded-md border-dashed bg-canvas font-mono text-data text-text-secondary ${selected ? 'border-2 border-selection' : 'border border-border-strong'}`}
      >
        {handles}
        <DeviceIcon device={device} size={16} />
        {t('internet').toUpperCase()}
      </div>
    );
  }

  const ff = device.formFactor;
  if (ff?.mount === 'rack') {
    // Outside a rack: front plate with ears and screw holes.
    const ear = (
      <span className="flex w-3.5 shrink-0 flex-col items-center justify-center gap-3.5 bg-rack-ear">
        <span className="size-[5px] rounded-pill" style={{ background: 'var(--sp-rack-screw)' }} />
        <span className="size-[5px] rounded-pill" style={{ background: 'var(--sp-rack-screw)' }} />
      </span>
    );
    return (
      <div className={`flex h-full overflow-hidden rounded-sm bg-tile ${border}`}>
        {handles}
        {ear}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-2.5">
          <div className="flex items-center gap-2">
            <StatusLed id={device.id} />
            <span className="truncate font-semibold">{device.name}</span>
            <span className="truncate font-mono text-data-sm text-text-secondary">{`${ff.units}U · ${meta}`}</span>
          </div>
          {detailed ? <Ports ports={ports} /> : null}
        </div>
        {ear}
      </div>
    );
  }

  const pill = ff?.shape === 'ceiling';
  return (
    <div className="relative h-full">
      <div
        className={`flex h-full flex-col overflow-hidden bg-tile ${border} ${pill ? 'justify-center rounded-pill px-4' : 'rounded-lg'}`}
      >
        {handles}
        <div className={`flex items-center gap-2.5 ${pill ? '' : 'bg-tile-header px-2.5 py-1.5'}`}>
          <span className="text-text-primary">
            <DeviceIcon device={device} size={pill ? 16 : 20} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{device.name}</span>
            {detailed ? (
              <span className="truncate font-mono text-data-sm text-text-secondary">{meta}</span>
            ) : null}
          </span>
          <span className="ml-auto pl-1">
            <StatusLed id={device.id} />
          </span>
        </div>
        {!pill && detailed ? (
          <div className="px-2.5 py-1.5">
            <Ports ports={ports} />
          </div>
        ) : null}
        {!pill && detailed ? <MemoryBar id={device.id} /> : null}
      </div>
      {!pill && device.kind !== 'client' ? (
        <>
          <span className="absolute -bottom-1.5 left-6 h-1 w-6.5 rounded-b-sm bg-device-foot" />
          <span className="absolute right-6 -bottom-1.5 h-1 w-6.5 rounded-b-sm bg-device-foot" />
        </>
      ) : null}
    </div>
  );
});
