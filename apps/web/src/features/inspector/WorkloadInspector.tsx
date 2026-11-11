import {
  addDockerNetwork,
  addInterface,
  connectInterfaces,
  deleteLink,
  deleteWorkload,
  type HostRef,
  OS_IDS,
  type OsId,
  type PortMapping,
  type Project,
  updateWorkload,
  type Volume,
  type Workload,
} from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { formatSize, parseSize } from '../../app/format';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Select } from '../../ui/Select';
import { useSelection } from '../canvas/selection';
import { InterfaceCard } from './device/NetworkTab';
import { OS_LABELS, rootDevice, WorkloadList } from './device/SoftwareTab';
import {
  AddButton,
  Breadcrumb,
  Card,
  CommitField,
  Grid,
  intValidator,
  RemoveButton,
  Section,
  useCommand,
  useTransaction,
} from './parts';

type Changes = Parameters<typeof updateWorkload.run>[1]['changes'];

/** Breadcrumb from the physical device down to `host` (bounded walk). */
export function hostPath(project: Project, host: HostRef): { label: string; ref: HostRef }[] {
  const path: { label: string; ref: HostRef }[] = [];
  let current: HostRef | undefined = host;
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (current.type === 'device') {
      path.unshift({ label: project.devices[current.id]?.name ?? '?', ref: current });
      break;
    }
    const w: Workload | undefined = project.workloads[current.id];
    path.unshift({ label: w?.name ?? '?', ref: current });
    current = w?.host;
  }
  return path;
}

export function useOpenHost() {
  const { set, setDetail } = useSelection();
  return (ref: HostRef, deviceId?: string) => {
    if (ref.type === 'device') set([ref.id]);
    else {
      if (deviceId) set([deviceId]);
      setDetail({ type: 'workload', id: ref.id });
    }
  };
}

/** I-03 Workload (docs/05 § 5.3). */
export function WorkloadInspector({ project, workload }: { project: Project; workload: Workload }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const openHost = useOpenHost();
  const device = rootDevice(project, workload.host);
  const path = hostPath(project, workload.host);
  const update = (changes: Changes) => run(updateWorkload, { id: workload.id, changes });
  const kindLabel =
    workload.kind === 'vm' ? 'VM' : workload.kind === 'lxc' ? 'LXC' : t('workload.container');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Breadcrumb
          items={[
            ...path.map((p) => ({ label: p.label, onClick: () => openHost(p.ref, device?.id) })),
            { label: workload.name },
          ]}
        />
        <h2 className="m-0 text-title font-semibold">{workload.name}</h2>
        <span className="text-text-secondary">{kindLabel}</span>
      </div>
      <CommitField
        label={t('workload.name')}
        value={workload.name}
        onCommit={(name) => name && update({ name })}
      />
      {workload.kind === 'container' ? (
        <ContainerSections project={project} workload={workload} update={update} />
      ) : (
        <GuestSections project={project} workload={workload} update={update} />
      )}
      <Button
        variant="danger"
        onClick={() => {
          run(deleteWorkload, { id: workload.id });
          if (device) useSelection.getState().set([device.id]);
        }}
      >
        {t('workload.delete')}
      </Button>
    </>
  );
}

function GuestSections({
  project,
  workload,
  update,
}: {
  project: Project;
  workload: Extract<Workload, { kind: 'vm' | 'lxc' }>;
  update: (changes: Changes) => void;
}) {
  const { t } = useTranslation('inspector');
  const transaction = useTransaction();
  const device = rootDevice(project, workload.host);
  const pools = device?.hardware.pools ?? [];
  const r = workload.resources;
  const setResources = (changes: Partial<typeof r>) => update({ resources: { ...r, ...changes } });
  const host: HostRef = { type: 'workload', id: workload.id };
  const nics = Object.values(project.interfaces).filter(
    (i) => i.owner.type === 'workload' && i.owner.id === workload.id,
  );
  const bridges = Object.values(project.interfaces).filter(
    (i) => i.owner.type === 'device' && i.owner.id === device?.id && i.kind === 'bridge',
  );
  const bridgeOf = (nicId: string) => {
    const link = Object.values(project.links).find((l) => l.a === nicId || l.b === nicId);
    return link ? { link, bridgeId: link.a === nicId ? link.b : link.a } : undefined;
  };

  return (
    <>
      <Section title={t('workload.resources')}>
        <Grid>
          <CommitField
            label={t('workload.vcpu')}
            mono
            value={String(r.cpu)}
            validate={(v) => (Number(v) > 0 && Number(v) <= 512 ? null : t('errors.number'))}
            onCommit={(v) => setResources({ cpu: Number(v) })}
          />
          <CommitField
            label={t('workload.memory')}
            mono
            value={formatSize(r.memoryBytes)}
            validate={(v) => (parseSize(v) ? null : t('errors.size'))}
            onCommit={(v) => setResources({ memoryBytes: parseSize(v) ?? r.memoryBytes })}
          />
        </Grid>
        {r.disks.map((disk, i) => (
          <div key={`${disk.poolId}-${i}`} className="flex items-end gap-2">
            <Grid>
              <Select
                label={t('workload.pool')}
                mono
                value={disk.poolId}
                options={pools.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(e) =>
                  setResources({
                    disks: r.disks.map((d, j) => (j === i ? { ...d, poolId: e.target.value } : d)),
                  })
                }
              />
              <CommitField
                label={t('workload.diskSize')}
                mono
                value={formatSize(disk.sizeBytes)}
                validate={(v) => (parseSize(v) ? null : t('errors.size'))}
                onCommit={(v) =>
                  setResources({
                    disks: r.disks.map((d, j) =>
                      j === i ? { ...d, sizeBytes: parseSize(v) ?? d.sizeBytes } : d,
                    ),
                  })
                }
              />
            </Grid>
            <RemoveButton
              label={t('actions.remove')}
              onClick={() => setResources({ disks: r.disks.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        {pools[0] ? (
          <AddButton
            label={t('workload.addDisk')}
            onClick={() =>
              setResources({
                disks: [...r.disks, { poolId: pools[0]?.id ?? '', sizeBytes: 32 * 1024 ** 3 }],
              })
            }
          />
        ) : (
          <p className="m-0 text-body-sm text-text-muted">{t('workload.noPools')}</p>
        )}
      </Section>

      {workload.kind === 'vm' ? (
        <Section title={t('workload.guestOs')}>
          <Grid>
            <Select
              label={t('software.system')}
              value={workload.guestOs.osId}
              options={OS_IDS.filter((id) => id !== 'proxmox-ve').map((id) => ({
                value: id,
                label: OS_LABELS[id],
              }))}
              onChange={(e) =>
                update({ guestOs: { ...workload.guestOs, osId: e.target.value as OsId } })
              }
            />
            <CommitField
              label={t('software.version')}
              mono
              value={workload.guestOs.version}
              onCommit={(version) =>
                version && update({ guestOs: { ...workload.guestOs, version } })
              }
            />
          </Grid>
        </Section>
      ) : (
        <Section title={t('workload.container')}>
          <CommitField
            label={t('workload.template')}
            mono
            value={workload.template}
            onCommit={(template) => template && update({ template })}
          />
          <Checkbox
            label={t('workload.unprivileged')}
            checked={workload.unprivileged}
            onChange={(e) => update({ unprivileged: e.target.checked })}
          />
        </Section>
      )}

      <Section title={t('workload.docker')}>
        <Checkbox
          label={t('software.dockerEnabled')}
          checked={!!workload.docker}
          onChange={(e) =>
            e.target.checked
              ? transaction('workload.docker', (step) => {
                  step(updateWorkload, {
                    id: workload.id,
                    changes: { docker: { enabled: true, networkIds: [] } },
                  });
                  step(addDockerNetwork, {
                    network: { host, name: 'bridge', driver: 'bridge', subnet: '172.17.0.0/16' },
                  });
                })
              : update({ docker: undefined })
          }
        />
      </Section>

      <Section
        title={t('workload.networkDevices')}
        action={
          bridges[0] ? (
            <AddButton
              label={t('workload.addNic')}
              onClick={() =>
                transaction('workload.addNic', (step) => {
                  const nic = step(addInterface, {
                    iface: {
                      owner: { type: 'workload', id: workload.id },
                      name: `net${nics.length}`,
                      kind: 'vnic',
                    },
                  });
                  step(connectInterfaces, { a: nic, b: bridges[0]?.id ?? '' });
                })
              }
            />
          ) : undefined
        }
      >
        {nics.map((nic) => {
          const attached = bridgeOf(nic.id);
          return (
            <div key={nic.id} className="flex flex-col gap-1.5">
              <Select
                label={t('workload.nicBridge', { name: nic.name })}
                mono
                value={attached?.bridgeId ?? ''}
                options={[
                  { value: '', label: '—' },
                  ...bridges.map((b) => ({ value: b.id, label: b.name })),
                ]}
                onChange={(e) =>
                  transaction('workload.nicBridge', (step) => {
                    if (attached) step(deleteLink, { id: attached.link.id });
                    if (e.target.value) step(connectInterfaces, { a: nic.id, b: e.target.value });
                  })
                }
              />
              <InterfaceCard project={project} iface={nic} siblings={nics} />
            </div>
          );
        })}
        {nics.length === 0 && !bridges[0] ? (
          <p className="m-0 text-body-sm text-text-muted">{t('workload.noBridge')}</p>
        ) : null}
      </Section>

      <WorkloadList
        project={project}
        host={host}
        canVirtualize={false}
        hasDocker={!!workload.docker}
      />
    </>
  );
}

function ContainerSections({
  project,
  workload,
  update,
}: {
  project: Project;
  workload: Extract<Workload, { kind: 'container' }>;
  update: (changes: Changes) => void;
}) {
  const { t } = useTranslation('inspector');
  const networks = Object.values(project.dockerNetworks).filter(
    (n) => n.host.type === workload.host.type && n.host.id === workload.host.id,
  );
  const ports = workload.portMappings;
  const volumes = workload.volumes;
  const device = rootDevice(project, workload.host);
  const pools = device?.hardware.pools ?? [];
  const setPort = (i: number, changes: Partial<PortMapping>) =>
    update({ portMappings: ports.map((p, j) => (j === i ? { ...p, ...changes } : p)) });
  const setVolume = (i: number, changes: Partial<Volume>) =>
    update({ volumes: volumes.map((v, j) => (j === i ? { ...v, ...changes } : v)) });
  const portValidator = intValidator(1, 65535, t('errors.port'));
  const networkValue =
    workload.network.mode === 'docker-network'
      ? workload.network.dockerNetworkId
      : workload.network.mode;

  return (
    <>
      <Section title={t('workload.image')}>
        <Grid>
          <CommitField
            label={t('workload.imageName')}
            mono
            value={workload.image}
            onCommit={(image) => image && update({ image: image.trim() })}
          />
          <CommitField
            label={t('workload.tag')}
            mono
            value={workload.tag}
            onCommit={(tag) => tag && update({ tag: tag.trim() })}
          />
        </Grid>
        <Select
          label={t('workload.networkMode')}
          mono
          value={networkValue}
          options={[
            ...networks.map((n) => ({ value: n.id, label: `${n.name} (${n.driver})` })),
            { value: 'host', label: 'host' },
            { value: 'none', label: 'none' },
          ]}
          onChange={(e) =>
            update({
              network:
                e.target.value === 'host' || e.target.value === 'none'
                  ? { mode: e.target.value }
                  : { mode: 'docker-network', dockerNetworkId: e.target.value },
            })
          }
        />
      </Section>

      <Section
        title={t('workload.ports')}
        action={
          <AddButton
            label={t('workload.addPort')}
            onClick={() =>
              update({
                portMappings: [...ports, { hostPort: 8080, containerPort: 80, protocol: 'tcp' }],
              })
            }
          />
        }
      >
        {ports.map((p, i) => (
          <div key={`${p.hostPort}-${p.containerPort}-${i}`} className="flex items-end gap-2">
            <Grid cols={3}>
              <CommitField
                label={t('workload.hostPort')}
                mono
                value={String(p.hostPort)}
                validate={portValidator}
                onCommit={(v) => setPort(i, { hostPort: Number(v) })}
              />
              <CommitField
                label={t('workload.containerPort')}
                mono
                value={String(p.containerPort)}
                validate={portValidator}
                onCommit={(v) => setPort(i, { containerPort: Number(v) })}
              />
              <Select
                label={t('workload.protocol')}
                mono
                value={p.protocol}
                options={[
                  { value: 'tcp', label: 'tcp' },
                  { value: 'udp', label: 'udp' },
                ]}
                onChange={(e) => setPort(i, { protocol: e.target.value as 'tcp' | 'udp' })}
              />
            </Grid>
            <RemoveButton
              label={t('actions.remove')}
              onClick={() => update({ portMappings: ports.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        {workload.network.mode === 'host' ? (
          <p className="m-0 text-body-sm text-text-muted">{t('workload.hostNetworkPorts')}</p>
        ) : null}
      </Section>

      <Section
        title={t('workload.volumes')}
        action={
          <AddButton
            label={t('workload.addVolume')}
            onClick={() =>
              update({
                volumes: [
                  ...volumes,
                  {
                    name: `data${volumes.length}`,
                    containerPath: '/data',
                    type: 'named',
                    ...(pools[0] ? { poolId: pools[0].id } : {}),
                  },
                ],
              })
            }
          />
        }
      >
        {volumes.map((v, i) => (
          <Card key={`${v.name}-${i}`}>
            <div className="flex items-end gap-2">
              <Grid>
                <CommitField
                  label={t('workload.volumeName')}
                  mono
                  value={v.name}
                  onCommit={(name) => name && setVolume(i, { name })}
                />
                <CommitField
                  label={t('workload.containerPath')}
                  mono
                  value={v.containerPath}
                  onCommit={(containerPath) => containerPath && setVolume(i, { containerPath })}
                />
              </Grid>
              <RemoveButton
                label={t('actions.remove')}
                onClick={() => update({ volumes: volumes.filter((_, j) => j !== i) })}
              />
            </div>
            <Grid cols={3}>
              <Select
                label={t('workload.volumeType')}
                mono
                value={v.type}
                options={['named', 'bind', 'nfs', 'smb'].map((x) => ({ value: x, label: x }))}
                onChange={(e) => setVolume(i, { type: e.target.value as Volume['type'] })}
              />
              <Select
                label={t('workload.pool')}
                mono
                value={v.poolId ?? ''}
                options={[
                  { value: '', label: '—' },
                  ...pools.map((p) => ({ value: p.id, label: p.name })),
                ]}
                onChange={(e) => setVolume(i, { poolId: e.target.value || undefined })}
              />
              <CommitField
                label={t('workload.size')}
                mono
                value={v.sizeBytes !== undefined ? formatSize(v.sizeBytes) : ''}
                validate={(x) => (x === '' || parseSize(x) ? null : t('errors.size'))}
                onCommit={(x) => setVolume(i, { sizeBytes: x === '' ? undefined : parseSize(x) })}
              />
            </Grid>
          </Card>
        ))}
      </Section>

      <Section title={t('workload.limits')}>
        <Grid>
          <CommitField
            label={t('workload.cpuLimit')}
            mono
            value={workload.limits?.cpu !== undefined ? String(workload.limits.cpu) : ''}
            placeholder={t('workload.unbounded')}
            validate={(v) => (v === '' || Number(v) > 0 ? null : t('errors.number'))}
            onCommit={(v) =>
              update({ limits: { ...workload.limits, cpu: v === '' ? undefined : Number(v) } })
            }
          />
          <CommitField
            label={t('workload.memoryLimit')}
            mono
            value={
              workload.limits?.memoryBytes !== undefined
                ? formatSize(workload.limits.memoryBytes)
                : ''
            }
            placeholder={t('workload.unbounded')}
            validate={(v) => (v === '' || parseSize(v) ? null : t('errors.size'))}
            onCommit={(v) =>
              update({
                limits: { ...workload.limits, memoryBytes: v === '' ? undefined : parseSize(v) },
              })
            }
          />
        </Grid>
      </Section>

      <WorkloadList
        project={project}
        host={{ type: 'workload', id: workload.id }}
        canVirtualize={false}
        hasDocker={false}
      />
    </>
  );
}
