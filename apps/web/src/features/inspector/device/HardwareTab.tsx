import { poolUsableBytes } from '@server-planner/engine';
import {
  applyDeviceModel,
  COMPUTE_KINDS,
  createId,
  type Device,
  defaultPoolLayout,
  GpuFeatureSchema,
  type Hardware,
  modelSpecChanges,
  POOL_MIN_DISKS,
  type Project,
  STANDALONE_SHAPES,
  type StandaloneShape,
  unplaceDevice,
  updateDevice,
} from '@server-planner/model';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSize, parseSize } from '../../../app/format';
import { catalogCorrectionUrl } from '../../../app/links';
import { useSession } from '../../../app/services';
import { catalogDevice, useCatalog } from '../../../catalog/store';
import { Silhouette, type SilhouetteName } from '../../../icons/devices';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import { Checkbox } from '../../../ui/Checkbox';
import { Segmented } from '../../../ui/Segmented';
import { Select } from '../../../ui/Select';
import { TextField } from '../../../ui/TextField';
import { DeviceModelPicker, modelName } from '../../catalog/DeviceModelPicker';
import {
  AddButton,
  Card,
  CommitField,
  Grid,
  intValidator,
  RemoveButton,
  Row,
  Section,
  useCommand,
  useTransaction,
} from '../parts';
import { SuggestCorrection } from '../SuggestCorrection';
import { ExpansionSection } from './ExpansionSection';
import { useMoveDevice } from './moveDevice';
import {
  byVendorAndModel,
  cpuFromCatalog,
  DISK_PRESETS,
  gpuFromCatalog,
  RAM_PRESETS,
} from './parts';
import { SaveTemplate } from './SaveTemplate';

const GiB = 1024 ** 3;
const DISK_TYPES = ['ssd-nvme', 'ssd-sata', 'hdd', 'emmc', 'sd'] as const;
const POOL_LAYOUTS = [
  'single',
  'mirror',
  'raid0',
  'raid5',
  'raid6',
  'raid10',
  'raidz1',
  'raidz2',
  'raidz3',
] as const;
const FILESYSTEMS = ['zfs', 'lvm-thin', 'ext4', 'xfs', 'btrfs', 'ntfs', 'refs'] as const;
const MEMORY_TYPES = ['DDR3', 'DDR4', 'DDR5', 'LPDDR4', 'LPDDR5'] as const;

/** I-02b Hardware (docs/05 § 5.2): form factor, location, CPU, RAM modules, disks, pools, power. */
export function HardwareTab({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const hw = device.hardware;
  // Predefined CPUs and GPUs (HW-09) come from the catalog, loaded on first use.
  const catalog = useCatalog((s) => s.catalog);
  useEffect(() => {
    void useCatalog.getState().load();
  }, []);
  const setHw = (next: Hardware) =>
    run(updateDevice, { id: device.id, changes: { hardware: next } });
  const setUps = (changes: {
    capacityVa?: number | undefined;
    capacityW?: number | undefined;
    batteryWh?: number | undefined;
  }) => {
    const merged = { ...device.ups, ...changes };
    for (const key of Object.keys(changes) as (keyof typeof changes)[])
      if (changes[key] === undefined) delete merged[key];
    const { capacityVa, capacityW, batteryWh } = merged;
    // VA and W are required together; a single figure stands in for the other until filled.
    const va = capacityVa ?? capacityW;
    const w = capacityW ?? capacityVa;
    run(updateDevice, {
      id: device.id,
      changes: {
        ups:
          va === undefined || w === undefined
            ? undefined
            : { capacityVa: va, capacityW: w, ...(batteryWh !== undefined ? { batteryWh } : {}) },
      },
    });
  };
  const sizeError = t('errors.size');
  const sizeValidator = (v: string) => (parseSize(v) === undefined ? sizeError : null);
  const numberValidator = intValidator(0, 100_000, t('errors.number'));

  const memoryTotal = (hw.memory?.modules ?? []).reduce((sum, m) => sum + m.sizeBytes * m.count, 0);
  const slotsUsed = (hw.memory?.modules ?? [])
    .filter((m) => !m.soldered)
    .reduce((sum, m) => sum + m.count, 0);

  return (
    <>
      <CommitField
        label={t('device.hostname')}
        mono
        value={device.hostname ?? ''}
        placeholder={device.name}
        onCommit={(hostname) =>
          run(updateDevice, { id: device.id, changes: { hostname: hostname || undefined } })
        }
      />
      {device.kind !== 'internet' ? <ModelSection device={device} /> : null}
      {device.formFactor ? <FormFactorSection project={project} device={device} /> : null}
      {device.formFactor ? <LocationSection project={project} device={device} /> : null}

      <Section
        title={t('hardware.cpu')}
        action={
          <AddButton
            label={t('hardware.addCpu')}
            onClick={() =>
              setHw({
                ...hw,
                cpus: [...hw.cpus, { model: 'CPU', cores: 4, threads: 4, arch: 'amd64' }],
              })
            }
          />
        }
      >
        {catalog ? (
          <PickFromList
            label={t('hardware.pick.cpu')}
            options={[...catalog.cpus].sort(byVendorAndModel).map((c) => ({
              value: c.id,
              label: [
                c.model,
                `${c.cores}C/${c.threads}T`,
                c.tdpW ? `${c.tdpW} W` : '',
                c.perf ? `perf ${Math.round(c.perf.score)}` : '',
              ]
                .filter(Boolean)
                .join(' · '),
            }))}
            onPick={(id) => {
              const cpu = catalog.cpus.find((c) => c.id === id);
              if (cpu)
                setHw({ ...hw, cpus: [...hw.cpus, cpuFromCatalog(cpu, catalog.catalogVersion)] });
            }}
          />
        ) : null}
        {hw.cpus.map((cpu, i) => {
          const setCpu = (changes: Partial<typeof cpu>) =>
            setHw({ ...hw, cpus: hw.cpus.map((c, j) => (j === i ? { ...c, ...changes } : c)) });
          return (
            <Card key={`cpu-${i}-${cpu.model}`}>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <CommitField
                    label={t('hardware.model')}
                    value={cpu.model}
                    onCommit={(model) => model && setCpu({ model })}
                  />
                </div>
                <RemoveButton
                  label={t('actions.remove')}
                  onClick={() => setHw({ ...hw, cpus: hw.cpus.filter((_, j) => j !== i) })}
                />
              </div>
              <Grid cols={3}>
                <CommitField
                  label={t('hardware.cores')}
                  mono
                  value={String(cpu.cores)}
                  validate={intValidator(1, 512, t('errors.number'))}
                  onCommit={(v) => setCpu({ cores: Number(v) })}
                />
                <CommitField
                  label={t('hardware.threads')}
                  mono
                  value={String(cpu.threads)}
                  validate={intValidator(1, 1024, t('errors.number'))}
                  onCommit={(v) => setCpu({ threads: Number(v) })}
                />
                <Select
                  label={t('hardware.arch')}
                  mono
                  value={cpu.arch}
                  options={[
                    { value: 'amd64', label: 'amd64' },
                    { value: 'arm64', label: 'arm64' },
                  ]}
                  onChange={(e) => setCpu({ arch: e.target.value as 'amd64' | 'arm64' })}
                />
              </Grid>
              {cpu.perf ? (
                <Row
                  label={t('hardware.perf')}
                  value={`${cpu.perf.source === 'estimated' ? '≈' : ''}${cpu.perf.score}`}
                />
              ) : null}
            </Card>
          );
        })}
      </Section>

      <Section
        title={t('hardware.memory')}
        action={
          <AddButton
            label={t('hardware.addModule')}
            onClick={() =>
              setHw({
                ...hw,
                memory: {
                  ...(hw.memory ?? {}),
                  modules: [...(hw.memory?.modules ?? []), { sizeBytes: 8 * GiB, count: 1 }],
                },
              })
            }
          />
        }
      >
        <PickFromList
          label={t('hardware.pick.ram')}
          options={RAM_PRESETS.map((r) => ({
            value: r.id,
            label: `${r.module.count} × ${formatSize(r.module.sizeBytes)} ${r.type}-${r.module.speedMts}`,
          }))}
          onPick={(id) => {
            const preset = RAM_PRESETS.find((r) => r.id === id);
            if (!preset) return;
            setHw({
              ...hw,
              memory: {
                ...(hw.memory ?? {}),
                type: hw.memory?.type ?? preset.type,
                modules: [...(hw.memory?.modules ?? []), { ...preset.module }],
              },
            });
          }}
        />
        <Row
          label={t('hardware.total')}
          value={`${formatSize(memoryTotal)}${hw.memory?.slotsTotal !== undefined ? ` · ${t('hardware.slots', { used: slotsUsed, total: hw.memory.slotsTotal })}` : ''}`}
        />
        <Grid cols={3}>
          <Select
            label={t('hardware.type')}
            mono
            value={hw.memory?.type ?? ''}
            options={[
              { value: '', label: '—' },
              ...MEMORY_TYPES.map((v) => ({ value: v, label: v })),
            ]}
            onChange={(e) =>
              setHw({
                ...hw,
                memory: {
                  ...(hw.memory ?? { modules: [] }),
                  type: (e.target.value || undefined) as (typeof MEMORY_TYPES)[number] | undefined,
                },
              })
            }
          />
          <CommitField
            label={t('hardware.slotsTotal')}
            mono
            value={hw.memory?.slotsTotal !== undefined ? String(hw.memory.slotsTotal) : ''}
            validate={(v) => (v === '' ? null : numberValidator(v))}
            onCommit={(v) =>
              setHw({
                ...hw,
                memory: {
                  ...(hw.memory ?? { modules: [] }),
                  slotsTotal: v === '' ? undefined : Number(v),
                },
              })
            }
          />
          <CommitField
            label={t('hardware.maxMemory')}
            mono
            value={hw.memory?.maxBytes !== undefined ? formatSize(hw.memory.maxBytes) : ''}
            validate={(v) => (v === '' ? null : sizeValidator(v))}
            onCommit={(v) =>
              setHw({
                ...hw,
                memory: {
                  ...(hw.memory ?? { modules: [] }),
                  maxBytes: v === '' ? undefined : parseSize(v),
                },
              })
            }
          />
        </Grid>
        {(hw.memory?.modules ?? []).map((module, i) => {
          const modules = hw.memory?.modules ?? [];
          const setModule = (changes: Partial<typeof module>) =>
            setHw({
              ...hw,
              memory: {
                ...(hw.memory ?? { modules: [] }),
                modules: modules.map((m, j) => (j === i ? { ...m, ...changes } : m)),
              },
            });
          return (
            <Card key={`mem-${i}-${module.sizeBytes}`}>
              <div className="flex items-end gap-2">
                <Grid cols={3}>
                  <CommitField
                    label={t('hardware.size')}
                    mono
                    value={formatSize(module.sizeBytes)}
                    validate={sizeValidator}
                    onCommit={(v) => setModule({ sizeBytes: parseSize(v) ?? module.sizeBytes })}
                  />
                  <CommitField
                    label={t('hardware.count')}
                    mono
                    value={String(module.count)}
                    validate={intValidator(1, 64, t('errors.number'))}
                    onCommit={(v) => setModule({ count: Number(v) })}
                  />
                  <CommitField
                    label={t('hardware.speed')}
                    mono
                    value={module.speedMts !== undefined ? String(module.speedMts) : ''}
                    validate={(v) => (v === '' ? null : numberValidator(v))}
                    onCommit={(v) => setModule({ speedMts: v === '' ? undefined : Number(v) })}
                  />
                </Grid>
                <RemoveButton
                  label={t('actions.remove')}
                  onClick={() =>
                    setHw({
                      ...hw,
                      memory: {
                        ...(hw.memory ?? { modules: [] }),
                        modules: modules.filter((_, j) => j !== i),
                      },
                    })
                  }
                />
              </div>
              <Checkbox
                label={t('hardware.soldered')}
                checked={!!module.soldered}
                onChange={(e) => setModule({ soldered: e.target.checked || undefined })}
              />
            </Card>
          );
        })}
      </Section>

      <DisksSection device={device} setHw={setHw} />

      <GpuSection device={device} setHw={setHw} />

      {COMPUTE_KINDS.includes(device.kind) ? <ExpansionSection device={device} /> : null}

      <Section title={t('hardware.power')}>
        <Grid>
          <CommitField
            label={t('hardware.idleW')}
            mono
            value={hw.power ? String(hw.power.idleW) : ''}
            validate={(v) => (v === '' ? null : numberValidator(v))}
            onCommit={(v) =>
              setHw({
                ...hw,
                power:
                  v === '' ? undefined : { idleW: Number(v), loadW: hw.power?.loadW ?? Number(v) },
              })
            }
          />
          <CommitField
            label={t('hardware.loadW')}
            mono
            value={hw.power ? String(hw.power.loadW) : ''}
            validate={(v) => (v === '' ? null : numberValidator(v))}
            onCommit={(v) =>
              setHw({
                ...hw,
                power:
                  v === '' ? undefined : { idleW: hw.power?.idleW ?? Number(v), loadW: Number(v) },
              })
            }
          />
        </Grid>
      </Section>

      {device.kind === 'ups' ? (
        <Section title={t('hardware.ups')}>
          <Grid>
            <CommitField
              label={t('hardware.upsVa')}
              mono
              value={device.ups ? String(device.ups.capacityVa) : ''}
              validate={(v) => (v === '' ? null : numberValidator(v))}
              onCommit={(v) => setUps({ capacityVa: v === '' ? undefined : Number(v) })}
            />
            <CommitField
              label={t('hardware.upsW')}
              mono
              value={device.ups ? String(device.ups.capacityW) : ''}
              validate={(v) => (v === '' ? null : numberValidator(v))}
              onCommit={(v) => setUps({ capacityW: v === '' ? undefined : Number(v) })}
            />
            <CommitField
              label={t('hardware.upsBattery')}
              mono
              value={device.ups?.batteryWh !== undefined ? String(device.ups.batteryWh) : ''}
              validate={(v) => (v === '' ? null : numberValidator(v))}
              onCommit={(v) => setUps({ batteryWh: v === '' ? undefined : Number(v) })}
            />
          </Grid>
        </Section>
      ) : null}

      {device.switching ? (
        <Section title={t('hardware.poe')}>
          <Grid>
            <CommitField
              label={t('hardware.poeBudget')}
              mono
              value={
                device.switching.poeBudgetW !== undefined ? String(device.switching.poeBudgetW) : ''
              }
              validate={(v) => (v === '' ? null : numberValidator(v))}
              onCommit={(v) => {
                const { poeBudgetW: _, ...rest } = device.switching ?? { layer: 2, managed: false };
                run(updateDevice, {
                  id: device.id,
                  changes: { switching: v === '' ? rest : { ...rest, poeBudgetW: Number(v) } },
                });
              }}
            />
          </Grid>
        </Section>
      ) : null}

      <PurchaseSection device={device} />

      <SaveTemplate device={device} />
    </>
  );
}

/** BOM data (EXP-03, CAP-09): owned / to buy / optional, price. */
function PurchaseSection({ device }: { device: Device }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const currency = useSession((s) => s.project?.settings.currency) ?? '';
  const purchase = device.purchase;
  const set = (changes: Partial<NonNullable<Device['purchase']>>) => {
    const next = { status: 'owned' as const, ...purchase, ...changes };
    if (next.price === undefined) delete next.price;
    if (next.price === undefined) delete next.currency;
    run(updateDevice, { id: device.id, changes: { purchase: next } });
  };
  return (
    <Section title={t('hardware.purchase')}>
      <Grid>
        <Select
          label={t('hardware.purchaseStatus')}
          value={purchase?.status ?? 'owned'}
          options={(['owned', 'to-buy', 'optional'] as const).map((value) => ({
            value,
            label: t(`hardware.purchaseStatuses.${value}`),
          }))}
          onChange={(e) => set({ status: e.target.value as 'owned' | 'to-buy' | 'optional' })}
        />
        <CommitField
          label={t('hardware.price', { currency: purchase?.currency ?? currency })}
          mono
          value={purchase?.price !== undefined ? String(purchase.price) : ''}
          validate={(v) =>
            v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0) ? null : t('errors.number')
          }
          onCommit={(v) =>
            set(
              v === ''
                ? { price: undefined }
                : { price: Number(v), currency: purchase?.currency ?? currency },
            )
          }
        />
      </Grid>
    </Section>
  );
}

/** HW-05: GPUs and accelerators (iGPU, discrete, Coral) with the features apps can use. */
function GpuSection({ device, setHw }: { device: Device; setHw: (hw: Hardware) => void }) {
  const { t } = useTranslation('inspector');
  const catalog = useCatalog((s) => s.catalog);
  const hw = device.hardware;
  const setGpu = (i: number, changes: Partial<Hardware['gpus'][number]>) =>
    setHw({ ...hw, gpus: hw.gpus.map((g, j) => (j === i ? { ...g, ...changes } : g)) });
  return (
    <Section
      title={t('hardware.gpus')}
      action={
        <AddButton
          label={t('hardware.addGpu')}
          onClick={() =>
            setHw({
              ...hw,
              gpus: [...hw.gpus, { model: 'Intel UHD Graphics', features: ['quicksync'] }],
            })
          }
        />
      }
    >
      {catalog ? (
        <PickFromList
          label={t('hardware.pick.gpu')}
          options={[...catalog.gpus].sort(byVendorAndModel).map((g) => ({
            value: g.id,
            label: [
              g.model,
              g.vramBytes ? formatSize(g.vramBytes) : '',
              g.features.join('/'),
              g.tdpW ? `${g.tdpW} W` : '',
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
          onPick={(id) => {
            const gpu = catalog.gpus.find((g) => g.id === id);
            if (gpu) setHw({ ...hw, gpus: [...hw.gpus, gpuFromCatalog(gpu)] });
          }}
        />
      ) : null}
      {hw.gpus.length === 0 ? (
        <p className="m-0 text-body-sm text-text-muted">{t('hardware.noGpu')}</p>
      ) : null}
      {hw.gpus.map((gpu, i) => (
        <Card key={`${gpu.model}-${i}`} label={gpu.model}>
          <div className="flex items-end gap-2">
            <Grid>
              <CommitField
                label={t('hardware.gpuModel')}
                value={gpu.model}
                onCommit={(model) => model && setGpu(i, { model })}
              />
              <Select
                label={t('hardware.expansion.slot')}
                value={gpu.attach ?? ''}
                options={[
                  { value: '', label: t('hardware.expansion.integrated') },
                  ...(['pcie', 'm2', 'usb'] as const).map((s) => ({
                    value: s,
                    label: t(`hardware.expansion.cardSlot.${s}`),
                  })),
                ]}
                onChange={(e) =>
                  setGpu(i, {
                    attach: (e.target.value || undefined) as Hardware['gpus'][number]['attach'],
                  })
                }
              />
              <CommitField
                label={t('hardware.vram')}
                mono
                value={gpu.vramBytes !== undefined ? formatSize(gpu.vramBytes) : ''}
                validate={(v) => (v === '' || parseSize(v) !== undefined ? null : t('errors.size'))}
                onCommit={(v) => setGpu(i, { vramBytes: v === '' ? undefined : parseSize(v) })}
              />
            </Grid>
            <RemoveButton
              label={t('actions.remove')}
              onClick={() => setHw({ ...hw, gpus: hw.gpus.filter((_, j) => j !== i) })}
            />
          </div>
          <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-0 p-0">
            <legend className="sr-only">{t('hardware.gpuFeatures')}</legend>
            {GpuFeatureSchema.options.map((f) => (
              <Checkbox
                key={f}
                label={t(`hardware.gpuFeature.${f}`)}
                checked={gpu.features.includes(f)}
                onChange={(e) =>
                  setGpu(i, {
                    features: e.target.checked
                      ? [...gpu.features, f]
                      : gpu.features.filter((x) => x !== f),
                  })
                }
              />
            ))}
          </fieldset>
        </Card>
      ))}
    </Section>
  );
}

function DisksSection({ device, setHw }: { device: Device; setHw: (hw: Hardware) => void }) {
  const { t } = useTranslation('inspector');
  const hw = device.hardware;
  const sizeValidator = (v: string) => (parseSize(v) === undefined ? t('errors.size') : null);
  const pooled = new Set(hw.pools.flatMap((p) => p.diskIds));
  const raw = hw.disks.reduce((sum, d) => sum + d.sizeBytes, 0);

  const addPool = () => {
    // A new pool takes the disks no pool uses yet, with a layout that suits their number.
    const free = hw.disks.filter((d) => !pooled.has(d.id)).map((d) => d.id);
    setHw({
      ...hw,
      pools: [
        ...hw.pools,
        {
          id: createId('storagePool'),
          name: hw.pools.length ? `pool${hw.pools.length}` : 'local',
          layout: defaultPoolLayout(free.length),
          diskIds: free,
          ...(free.length > 1 ? { filesystem: 'zfs' as const } : {}),
        },
      ],
    });
  };

  return (
    <>
      <Section title={t('hardware.disksCount', { count: hw.disks.length })}>
        {hw.disks.length === 0 ? (
          <p className="m-0 text-body-sm text-text-muted">{t('hardware.noDisks')}</p>
        ) : (
          <span className="font-mono text-data-sm text-text-secondary">
            {t('hardware.disksRaw', { size: formatSize(raw, true) })}
          </span>
        )}
        {hw.disks.map((disk) => {
          const setDisk = (changes: Partial<typeof disk>) =>
            setHw({
              ...hw,
              disks: hw.disks.map((d) => (d.id === disk.id ? { ...d, ...changes } : d)),
            });
          return (
            <Card key={disk.id}>
              <div className="flex items-end gap-2">
                <Grid cols={3}>
                  <CommitField
                    label={t('hardware.name')}
                    mono
                    value={disk.name}
                    onCommit={(name) => name && setDisk({ name })}
                  />
                  <Select
                    label={t('hardware.type')}
                    mono
                    value={disk.type}
                    options={DISK_TYPES.map((v) => ({
                      value: v,
                      label: t(`hardware.diskTypes.${v}`),
                    }))}
                    onChange={(e) => setDisk({ type: e.target.value as typeof disk.type })}
                  />
                  <CommitField
                    label={t('hardware.size')}
                    mono
                    value={formatSize(disk.sizeBytes, true)}
                    validate={sizeValidator}
                    onCommit={(v) => setDisk({ sizeBytes: parseSize(v) ?? disk.sizeBytes })}
                  />
                </Grid>
                <RemoveButton
                  label={t('hardware.removeDisk', { name: disk.name })}
                  onClick={() =>
                    setHw({
                      ...hw,
                      disks: hw.disks.filter((d) => d.id !== disk.id),
                      pools: hw.pools.map((p) => ({
                        ...p,
                        diskIds: p.diskIds.filter((id) => id !== disk.id),
                      })),
                    })
                  }
                />
              </div>
            </Card>
          );
        })}
        <AddDisksForm
          onAdd={(count, type, sizeBytes) =>
            setHw({
              ...hw,
              disks: [
                ...hw.disks,
                ...Array.from({ length: count }, (_, i) => ({
                  id: createId('disk'),
                  name: `disk${hw.disks.length + i}`,
                  type,
                  sizeBytes,
                })),
              ],
            })
          }
        />
      </Section>
      <Section
        title={t('hardware.pools')}
        action={<AddButton label={t('hardware.addPool')} onClick={addPool} />}
      >
        {hw.pools.length === 0 ? (
          <p className="m-0 text-body-sm text-text-muted">
            {hw.disks.length === 0 ? t('hardware.noPoolsNoDisks') : t('hardware.noPools')}
          </p>
        ) : null}
        {hw.pools.map((pool) => {
          const setPool = (changes: Partial<typeof pool>) =>
            setHw({
              ...hw,
              pools: hw.pools.map((p) => (p.id === pool.id ? { ...p, ...changes } : p)),
            });
          const members = pool.diskIds.filter((id) => hw.disks.some((d) => d.id === id)).length;
          const needed = POOL_MIN_DISKS[pool.layout];
          const usable = poolUsableBytes(device, pool);
          const poolRaw = hw.disks
            .filter((d) => pool.diskIds.includes(d.id))
            .reduce((sum, d) => sum + d.sizeBytes, 0);
          return (
            <Card key={pool.id}>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <CommitField
                    label={t('hardware.name')}
                    mono
                    value={pool.name}
                    onCommit={(name) => name && setPool({ name })}
                  />
                </div>
                <RemoveButton
                  label={t('hardware.removePool', { name: pool.name })}
                  onClick={() => setHw({ ...hw, pools: hw.pools.filter((p) => p.id !== pool.id) })}
                />
              </div>
              <Grid>
                <Select
                  label={t('hardware.layout')}
                  mono
                  value={pool.layout}
                  options={POOL_LAYOUTS.map((v) => ({ value: v, label: v }))}
                  onChange={(e) => setPool({ layout: e.target.value as typeof pool.layout })}
                />
                <Select
                  label={t('hardware.filesystem')}
                  mono
                  value={pool.filesystem ?? ''}
                  options={[
                    { value: '', label: '—' },
                    ...FILESYSTEMS.map((v) => ({ value: v, label: v })),
                  ]}
                  onChange={(e) =>
                    setPool({
                      filesystem: (e.target.value || undefined) as typeof pool.filesystem,
                    })
                  }
                />
              </Grid>
              {members < needed ? (
                <p className="m-0 text-body-sm text-warning-text">
                  {members === 0
                    ? hw.disks.length === 0
                      ? t('hardware.poolNoDisksAtAll')
                      : t('hardware.poolNoDisks')
                    : t('hardware.poolTooFew', { layout: pool.layout, needed, count: members })}
                </p>
              ) : (
                <span className="font-mono text-data-sm text-text-secondary">
                  {t('hardware.poolCapacity', {
                    usable: formatSize(usable, true),
                    raw: formatSize(poolRaw, true),
                    count: members,
                  })}
                </span>
              )}
              {hw.disks.length > 0 ? (
                <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-0 p-0">
                  <legend className="mb-1 text-body-sm text-text-secondary">
                    {t('hardware.poolDisks')}
                  </legend>
                  {hw.disks.map((disk) => (
                    <Checkbox
                      key={disk.id}
                      label={`${disk.name} · ${formatSize(disk.sizeBytes, true)}`}
                      checked={pool.diskIds.includes(disk.id)}
                      onChange={(e) =>
                        setPool({
                          diskIds: e.target.checked
                            ? [...pool.diskIds, disk.id]
                            : pool.diskIds.filter((id) => id !== disk.id),
                        })
                      }
                    />
                  ))}
                </fieldset>
              ) : null}
            </Card>
          );
        })}
      </Section>
    </>
  );
}

const DISK_COUNTS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Several identical disks at once (e.g. 4 × 8 TB HDD) — HW-03. */
function AddDisksForm({
  onAdd,
}: {
  onAdd: (count: number, type: (typeof DISK_TYPES)[number], sizeBytes: number) => void;
}) {
  const { t } = useTranslation('inspector');
  const [count, setCount] = useState(1);
  const [type, setType] = useState<(typeof DISK_TYPES)[number]>('ssd-nvme');
  const [size, setSize] = useState('1 TB');
  const bytes = parseSize(size);
  return (
    <form
      aria-label={t('hardware.addDisks')}
      className="flex flex-col gap-2 rounded-md border border-dashed border-border-default p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (bytes !== undefined) onAdd(count, type, bytes);
      }}
    >
      <PickFromList
        label={t('hardware.pick.disk')}
        options={DISK_PRESETS.map((d) => ({
          value: d.id,
          label: `${t(`hardware.diskTypes.${d.type}`)} ${formatSize(d.sizeBytes, true)}`,
        }))}
        onPick={(id) => {
          const preset = DISK_PRESETS.find((d) => d.id === id);
          if (!preset) return;
          setType(preset.type);
          setSize(formatSize(preset.sizeBytes, true));
        }}
      />
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-2">
        <Select
          label={t('hardware.diskCount')}
          mono
          value={String(count)}
          options={DISK_COUNTS.map((n) => ({ value: String(n), label: `${n}×` }))}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <Select
          label={t('hardware.type')}
          value={type}
          options={DISK_TYPES.map((v) => ({ value: v, label: t(`hardware.diskTypes.${v}`) }))}
          onChange={(e) => setType(e.target.value as (typeof DISK_TYPES)[number])}
        />
      </div>
      <TextField
        label={t('hardware.size')}
        mono
        value={size}
        {...(bytes === undefined ? { error: t('errors.size') } : {})}
        onChange={(e) => setSize(e.target.value)}
      />
      <Button type="submit" size="sm" disabled={bytes === undefined}>
        {t('hardware.addDisks')}
      </Button>
    </form>
  );
}

const SHAPE_ICON: Record<StandaloneShape, SilhouetteName> = {
  tower: 'tower',
  'mini-pc': 'mini-pc',
  desktop: 'desktop',
  nas: 'nas',
  wall: 'wall',
  ceiling: 'ceiling',
  sbc: 'sbc',
  other: 'desktop',
};

function FormFactorSection({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('inspector');
  const transaction = useTransaction();
  const ff = device.formFactor;
  if (!ff) return null;
  const inRack =
    device.placement && project.locations[device.placement.locationId]?.kind === 'rack';

  // A form factor change can invalidate a rack placement — take the device out of the rack first.
  const setFormFactor = (formFactor: NonNullable<Device['formFactor']>) =>
    transaction('device.formFactor', (run) => {
      if (inRack) run(unplaceDevice, { id: device.id, position: { x: 2, y: 2 } });
      run(updateDevice, { id: device.id, changes: { formFactor } });
    });

  return (
    <Section title={t('hardware.formFactor')}>
      <Segmented
        label={t('hardware.mount')}
        fill
        value={ff.mount}
        options={[
          { value: 'rack', label: t('hardware.rackMount') },
          { value: 'standalone', label: t('hardware.standalone') },
        ]}
        onChange={(mount) =>
          mount !== ff.mount &&
          setFormFactor(
            mount === 'rack'
              ? { mount: 'rack', units: 1, width: '19in' }
              : { mount: 'standalone', shape: 'desktop' },
          )
        }
      />
      {ff.mount === 'rack' ? (
        <Grid>
          <Select
            label={t('hardware.units')}
            mono
            value={String(ff.units)}
            options={[1, 2, 3, 4, 5, 6, 7, 8].map((u) => ({ value: String(u), label: `${u}U` }))}
            onChange={(e) => setFormFactor({ ...ff, units: Number(e.target.value) })}
          />
          <Select
            label={t('hardware.width')}
            mono
            value={ff.width}
            options={[
              { value: '19in', label: '19″' },
              { value: '10in', label: '10″' },
            ]}
            onChange={(e) => setFormFactor({ ...ff, width: e.target.value as '10in' | '19in' })}
          />
        </Grid>
      ) : (
        <fieldset className="m-0 grid grid-cols-4 gap-1.5 border-0 p-0">
          <legend className="sr-only">{t('hardware.shape')}</legend>
          {STANDALONE_SHAPES.map((shape) => {
            const active = ff.shape === shape;
            return (
              <label
                key={shape}
                className={`flex h-14.5 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border text-body-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus-ring ${active ? 'border-selection bg-accent-subtle text-text-primary' : 'border-border-subtle bg-tile text-text-secondary hover:text-text-primary'}`}
              >
                <input
                  type="radio"
                  name={`shape-${device.id}`}
                  value={shape}
                  checked={active}
                  onChange={() => setFormFactor({ mount: 'standalone', shape })}
                  className="sr-only"
                />
                <Silhouette name={SHAPE_ICON[shape]} size={20} />
                {t(`shape.${shape}`)}
              </label>
            );
          })}
        </fieldset>
      )}
      <p className="m-0 text-body-sm text-text-muted">{t('hardware.formFactorHint')}</p>
    </Section>
  );
}

function LocationSection({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('inspector');
  const moveDevice = useMoveDevice();
  const location = device.placement ? project.locations[device.placement.locationId] : undefined;
  const move = (locationId: string) => moveDevice(project, device, locationId);
  return (
    <Section title={t('hardware.location')}>
      <Select
        label={t('hardware.location')}
        hideLabel
        value={device.placement?.locationId ?? ''}
        options={[
          { value: '', label: t('hardware.unplaced') },
          ...Object.values(project.locations).map((l) => ({
            value: l.id,
            label: `${l.name} · ${t(`locationKind.${l.kind}`)}`,
          })),
        ]}
        onChange={(e) => move(e.target.value)}
      />
      {location?.kind === 'rack' && device.placement?.u !== undefined ? (
        <Row
          label={t('hardware.unit')}
          value={
            device.placement.onShelf
              ? t('hardware.onShelf', { u: device.placement.u })
              : `U${device.placement.u}`
          }
        />
      ) : null}
    </Section>
  );
}

/** MODEL (D-05): the catalog model a device was built from, or generic; "Choose model" applies one. */
function ModelSection({ device }: { device: Device }) {
  const { t } = useTranslation(['inspector', 'canvas']);
  const run = useCommand();
  const catalog = useCatalog((s) => s.catalog);
  const [open, setOpen] = useState(false);
  const model = device.catalogRef ? catalogDevice(catalog, device.catalogRef.id) : undefined;
  // LIB-03: the project keeps its copy; a newer catalog with different data only offers an update.
  const changes =
    model && catalog && device.catalogRef?.version !== catalog.catalogVersion
      ? modelSpecChanges(device, model)
      : [];
  useEffect(() => {
    if (device.catalogRef) void useCatalog.getState().load();
  }, [device.catalogRef]);
  return (
    <Section
      title={t('hardware.catalogModel')}
      action={<AddButton label={t('hardware.chooseModel')} onClick={() => setOpen(true)} />}
    >
      <span className="text-body">
        {model
          ? modelName(model)
          : device.catalogRef
            ? device.catalogRef.id
            : t('hardware.genericModel', { kind: t(`canvas:deviceKind.${device.kind}`) })}
      </span>
      {model && catalog ? (
        <SuggestCorrection
          href={catalogCorrectionUrl({
            kind: 'device',
            id: model.id,
            name: modelName(model),
            catalogVersion: catalog.catalogVersion,
            facts: {
              kind: model.kind,
              cpu: model.hardware.cpus.map((c) => c.model).join(' + '),
              memory: model.hardware.memory?.maxBytes
                ? `max ${formatSize(model.hardware.memory.maxBytes)} · ${model.hardware.memory.slotsTotal ?? '?'} slots`
                : undefined,
              ports: model.ports.map((p) => `${p.name} ${p.speedMbps ?? ''}`.trim()).join(', '),
              power: model.hardware.power
                ? `${model.hardware.power.idleW}–${model.hardware.power.loadW} W`
                : undefined,
              expansion: model.expansion
                ? `PCIe ${model.expansion.pcieSlots ?? 0} · M.2 ${model.expansion.m2Slots ?? 0} · SATA ${model.expansion.sataBays ?? 0}`
                : undefined,
            },
          })}
        />
      ) : null}
      {model && catalog && changes.length > 0 ? (
        <Banner
          kind="info"
          actions={
            <Button
              size="sm"
              onClick={() =>
                run(applyDeviceModel, {
                  id: device.id,
                  model,
                  catalogVersion: catalog.catalogVersion,
                })
              }
            >
              {t('hardware.specApply')}
            </Button>
          }
        >
          {t('hardware.specUpdate', {
            from: device.catalogRef?.version ?? '',
            to: catalog.catalogVersion,
            fields: changes.map((f) => t(`hardware.specFields.${f}`)).join(', '),
          })}
        </Banner>
      ) : null}
      {open ? (
        <DeviceModelPicker
          open
          onOpenChange={setOpen}
          kind={device.kind}
          title={t('hardware.chooseModelFor', { name: device.name })}
          onPick={(picked, catalogVersion) =>
            run(applyDeviceModel, { id: device.id, model: picked, catalogVersion })
          }
        />
      ) : null}
    </Section>
  );
}

/** HW-09: a list that adds a predefined part; it returns to its placeholder after each pick. */
export function PickFromList({
  label,
  options,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
}) {
  const { t } = useTranslation('inspector');
  return (
    <Select
      label={label}
      value=""
      options={[{ value: '', label: t('hardware.pick.placeholder') }, ...options]}
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
    />
  );
}
