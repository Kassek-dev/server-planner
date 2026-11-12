import {
  applyDeviceModel,
  createId,
  type Device,
  type Hardware,
  type Project,
  STANDALONE_SHAPES,
  type StandaloneShape,
  unplaceDevice,
  updateDevice,
} from '@server-planner/model';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSize, parseSize } from '../../../app/format';
import { catalogDevice, useCatalog } from '../../../catalog/store';
import { Silhouette, type SilhouetteName } from '../../../icons/devices';
import { Checkbox } from '../../../ui/Checkbox';
import { Segmented } from '../../../ui/Segmented';
import { Select } from '../../../ui/Select';
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
import { useMoveDevice } from './moveDevice';

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
  const setHw = (next: Hardware) =>
    run(updateDevice, { id: device.id, changes: { hardware: next } });
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
    </>
  );
}

function DisksSection({ device, setHw }: { device: Device; setHw: (hw: Hardware) => void }) {
  const { t } = useTranslation('inspector');
  const hw = device.hardware;
  const sizeValidator = (v: string) => (parseSize(v) === undefined ? t('errors.size') : null);
  return (
    <>
      <Section
        title={t('hardware.disks')}
        action={
          <AddButton
            label={t('hardware.addDisk')}
            onClick={() =>
              setHw({
                ...hw,
                disks: [
                  ...hw.disks,
                  {
                    id: createId('disk'),
                    name: `disk${hw.disks.length}`,
                    type: 'ssd-nvme',
                    sizeBytes: 500e9,
                  },
                ],
              })
            }
          />
        }
      >
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
                    options={DISK_TYPES.map((v) => ({ value: v, label: v }))}
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
                  label={t('actions.remove')}
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
      </Section>
      <Section
        title={t('hardware.pools')}
        action={
          <AddButton
            label={t('hardware.addPool')}
            onClick={() =>
              setHw({
                ...hw,
                pools: [
                  ...hw.pools,
                  {
                    id: createId('storagePool'),
                    name: hw.pools.length ? `pool${hw.pools.length}` : 'local',
                    layout: 'single',
                    diskIds: [],
                  },
                ],
              })
            }
          />
        }
      >
        {hw.pools.map((pool) => {
          const setPool = (changes: Partial<typeof pool>) =>
            setHw({
              ...hw,
              pools: hw.pools.map((p) => (p.id === pool.id ? { ...p, ...changes } : p)),
            });
          return (
            <Card key={pool.id}>
              <div className="flex items-end gap-2">
                <Grid cols={3}>
                  <CommitField
                    label={t('hardware.name')}
                    mono
                    value={pool.name}
                    onCommit={(name) => name && setPool({ name })}
                  />
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
                <RemoveButton
                  label={t('actions.remove')}
                  onClick={() => setHw({ ...hw, pools: hw.pools.filter((p) => p.id !== pool.id) })}
                />
              </div>
              <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-0 p-0">
                <legend className="sr-only">{t('hardware.poolDisks')}</legend>
                {hw.disks.map((disk) => (
                  <Checkbox
                    key={disk.id}
                    label={disk.name}
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
            </Card>
          );
        })}
      </Section>
    </>
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
