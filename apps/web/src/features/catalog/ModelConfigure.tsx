import {
  addCard,
  type CatalogDevice,
  type Command,
  createId,
  type Disk,
  type Hardware,
  type MemoryModule,
  type NewCard,
  type Project,
  updateDevice,
} from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { formatSize } from '../../app/format';
import { Checkbox } from '../../ui/Checkbox';
import { Select } from '../../ui/Select';
import { CARD_PRESETS, DISK_PRESETS, RAM_PRESETS } from '../inspector/device/parts';

/** LIB-05 (1.10) what the Configure step of D-05 adds to the model as it ships. */
export interface ModelConfig {
  /** Replaces the model's memory modules (a kit within its slots and maximum). */
  memory?: MemoryModule;
  disks: { type: Disk['type']; sizeBytes: number }[];
  cards: NewCard[];
}

export const EMPTY_CONFIG: ModelConfig = { disks: [], cards: [] };

/** Kits that fit the model: its memory type, at most its slots and its maximum. */
export function ramKits(model: CatalogDevice) {
  const memory = model.hardware.memory;
  if (!memory) return [];
  return RAM_PRESETS.filter(
    (p) =>
      (!memory.type || p.type === memory.type) &&
      (memory.slotsTotal === undefined || p.module.count <= memory.slotsTotal) &&
      (memory.maxBytes === undefined || p.module.sizeBytes * p.module.count <= memory.maxBytes),
  );
}

/** Free slots / bays of the model as shipped (default disks take theirs). */
export function freeSlots(model: CatalogDevice, config: ModelConfig) {
  const slots = model.expansion ?? {};
  const disks = [...(model.hardware.defaultDisks ?? []), ...config.disks];
  const m2 =
    (slots.m2Slots ?? 0) -
    disks.filter((d) => d.type === 'ssd-nvme').length -
    config.cards.filter((c) => c.slot === 'm2').length;
  const sata =
    (slots.sataBays ?? 0) - disks.filter((d) => d.type === 'hdd' || d.type === 'ssd-sata').length;
  const pcie = (slots.pcieSlots ?? 0) - config.cards.filter((c) => c.slot === 'pcie').length;
  return { pcie, m2, sata, known: model.expansion !== undefined };
}

/** Commands that put the configuration on a device built from the model. */
export function configCommands(
  project: Project,
  deviceId: string,
  config: ModelConfig,
): { command: Command<unknown, unknown>; payload: unknown }[] {
  const device = project.devices[deviceId];
  if (!device) return [];
  const out: { command: Command<unknown, unknown>; payload: unknown }[] = [];
  if (config.memory || config.disks.length > 0) {
    const hw: Hardware = { ...device.hardware };
    if (config.memory && hw.memory) hw.memory = { ...hw.memory, modules: [config.memory] };
    if (config.disks.length > 0)
      hw.disks = [
        ...hw.disks,
        ...config.disks.map((d, i) => ({
          id: createId('disk'),
          name: `disk${hw.disks.length + i}`,
          type: d.type,
          sizeBytes: d.sizeBytes,
        })),
      ];
    out.push({
      command: updateDevice as Command<unknown, unknown>,
      payload: { id: deviceId, changes: { hardware: hw } },
    });
  }
  for (const card of config.cards)
    out.push({ command: addCard as Command<unknown, unknown>, payload: { deviceId, card } });
  return out;
}

/** The Configure step: memory kit, extra disks and add-in cards that fit the model. */
export function ModelConfigure({
  model,
  config,
  onChange,
}: {
  model: CatalogDevice;
  config: ModelConfig;
  onChange: (config: ModelConfig) => void;
}) {
  const { t } = useTranslation('catalog');
  const kits = ramKits(model);
  const free = freeSlots(model, config);
  const shipped = (model.hardware.memory?.modules ?? []).reduce(
    (s, m) => s + m.sizeBytes * m.count,
    0,
  );
  const diskFits = (type: Disk['type']) =>
    !free.known ||
    (type === 'ssd-nvme'
      ? free.m2 > 0
      : type === 'hdd' || type === 'ssd-sata'
        ? free.sata > 0
        : true);
  const cardFits = (card: NewCard) =>
    !free.known || (card.slot === 'pcie' ? free.pcie > 0 : card.slot === 'm2' ? free.m2 > 0 : true);
  return (
    <div className="flex flex-col gap-4 overflow-auto p-4">
      <p className="m-0 text-body-sm text-text-secondary">
        {free.known
          ? t('configure.slots', { pcie: free.pcie, m2: free.m2, sata: free.sata })
          : t('configure.noSlots')}
      </p>
      {kits.length > 0 ? (
        <Select
          label={t('configure.memory')}
          value={kits.find((k) => k.module === config.memory)?.id ?? ''}
          options={[
            { value: '', label: t('configure.asShipped', { size: formatSize(shipped) }) },
            ...kits.map((k) => ({
              value: k.id,
              label: `${k.module.count}× ${formatSize(k.module.sizeBytes)} ${k.type}-${k.module.speedMts}`,
            })),
          ]}
          onChange={(e) => {
            const kit = kits.find((k) => k.id === e.target.value);
            const { memory: _, ...rest } = config;
            onChange(kit ? { ...rest, memory: kit.module } : rest);
          }}
        />
      ) : null}
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
          {t('configure.disks')}
        </legend>
        {config.disks.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: identical disks have no other identity
          <div key={`${d.type}-${i}`} className="flex items-center gap-2 text-body-sm">
            <span className="flex-1 font-mono">{`${d.type} ${formatSize(d.sizeBytes, true)}`}</span>
            <button
              type="button"
              className="text-accent-text hover:underline"
              onClick={() => onChange({ ...config, disks: config.disks.filter((_, j) => j !== i) })}
            >
              {t('configure.remove')}
            </button>
          </div>
        ))}
        <Select
          label={t('configure.addDisk')}
          value=""
          options={[
            { value: '', label: t('configure.choose') },
            ...DISK_PRESETS.filter(
              (d) => d.type !== 'emmc' && d.type !== 'sd' && diskFits(d.type),
            ).map((d) => ({ value: d.id, label: `${d.type} ${formatSize(d.sizeBytes, true)}` })),
          ]}
          onChange={(e) => {
            const preset = DISK_PRESETS.find((d) => d.id === e.target.value);
            if (preset)
              onChange({
                ...config,
                disks: [...config.disks, { type: preset.type, sizeBytes: preset.sizeBytes }],
              });
          }}
        />
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="mb-1 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
          {t('configure.cards')}
        </legend>
        {CARD_PRESETS.map((preset) => {
          const chosen = config.cards.includes(preset.card);
          return (
            <Checkbox
              key={preset.id}
              label={`${preset.card.model} (${preset.card.slot === 'm2' ? 'M.2' : 'PCIe'})`}
              checked={chosen}
              disabled={!chosen && !cardFits(preset.card)}
              onChange={(e) =>
                onChange({
                  ...config,
                  cards: e.target.checked
                    ? [...config.cards, preset.card]
                    : config.cards.filter((c) => c !== preset.card),
                })
              }
            />
          );
        })}
      </fieldset>
    </div>
  );
}
