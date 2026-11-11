import {
  addApp,
  addDockerNetwork,
  addInterface,
  addWorkload,
  COMPUTE_KINDS,
  connectInterfaces,
  type Device,
  type HostRef,
  OS_IDS,
  type OsId,
  type Project,
  setDeviceOs,
  updateDevice,
  type Workload,
} from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { formatSize } from '../../../app/format';
import { Checkbox } from '../../../ui/Checkbox';
import { Select } from '../../../ui/Select';
import { nextName } from '../../canvas/actions';
import { useSelection } from '../../canvas/selection';
import {
  AddButton,
  CommitField,
  Grid,
  OpenRow,
  Section,
  useCommand,
  useTransaction,
} from '../parts';

const GiB = 1024 ** 3;

export const OS_LABELS: Record<OsId, string> = {
  'proxmox-ve': 'Proxmox VE',
  debian: 'Debian',
  'ubuntu-server': 'Ubuntu Server',
  'windows-server': 'Windows Server',
};
const DEFAULT_VERSION: Record<OsId, string> = {
  'proxmox-ve': '8.3',
  debian: '12',
  'ubuntu-server': '24.04',
  'windows-server': '2025',
};

/** I-02c Software (docs/05 § 5.2, SW-01…07). */
export function SoftwareTab({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const transaction = useTransaction();
  if (!COMPUTE_KINDS.includes(device.kind)) {
    return <p className="m-0 text-text-secondary">{t('software.notCompute')}</p>;
  }
  const host: HostRef = { type: 'device', id: device.id };
  const isProxmox = device.os?.osId === 'proxmox-ve';

  return (
    <>
      <Section title={t('software.os')}>
        <Grid>
          <Select
            label={t('software.system')}
            value={device.os?.osId ?? ''}
            options={[
              { value: '', label: t('software.noOs') },
              ...OS_IDS.map((id) => ({ value: id, label: OS_LABELS[id] })),
            ]}
            onChange={(e) => {
              const osId = e.target.value as OsId | '';
              run(setDeviceOs, {
                id: device.id,
                os: osId ? { osId, version: DEFAULT_VERSION[osId] } : null,
              });
            }}
          />
          {device.os ? (
            <CommitField
              label={t('software.version')}
              mono
              value={device.os.version}
              onCommit={(version) =>
                device.os &&
                version &&
                run(setDeviceOs, { id: device.id, os: { ...device.os, version } })
              }
            />
          ) : null}
        </Grid>
      </Section>

      {device.os ? (
        <Section title={t('software.dockerOnHost')}>
          <Checkbox
            label={t('software.dockerEnabled')}
            checked={!!device.docker}
            onChange={(e) =>
              e.target.checked
                ? transaction('device.docker', (step) => {
                    step(updateDevice, {
                      id: device.id,
                      changes: { docker: { enabled: true, networkIds: [] } },
                    });
                    step(addDockerNetwork, {
                      network: { host, name: 'bridge', driver: 'bridge', subnet: '172.17.0.0/16' },
                    });
                  })
                : run(updateDevice, { id: device.id, changes: { docker: undefined } })
            }
          />
          {isProxmox ? (
            <p className="m-0 text-body-sm text-text-muted">{t('software.dockerOnProxmox')}</p>
          ) : null}
        </Section>
      ) : null}

      <WorkloadList
        project={project}
        host={host}
        canVirtualize={isProxmox}
        hasDocker={!!device.docker}
      />
    </>
  );
}

const badge = (w: Workload) => (w.kind === 'vm' ? 'VM' : w.kind === 'lxc' ? 'LXC' : 'CT');

/** Workloads and apps on a host, with "add" actions (used by devices and VM/LXC workloads). */
export function WorkloadList({
  project,
  host,
  canVirtualize,
  hasDocker,
}: {
  project: Project;
  host: HostRef;
  canVirtualize: boolean;
  hasDocker: boolean;
}) {
  const { t } = useTranslation('inspector');
  const transaction = useTransaction();
  const setDetail = useSelection((s) => s.setDetail);
  const hosted = Object.values(project.workloads).filter(
    (w) => w.host.type === host.type && w.host.id === host.id,
  );
  const apps = Object.values(project.apps).filter(
    (a) => a.runsOn.type === host.type && a.runsOn.id === host.id,
  );
  const names = () => Object.values(project.workloads).map((w) => w.name);
  const hostDevice = rootDevice(project, host);
  const pools = hostDevice?.hardware.pools ?? [];
  const bridge = Object.values(project.interfaces).find(
    (i) => i.owner.type === 'device' && i.owner.id === hostDevice?.id && i.kind === 'bridge',
  );

  const addGuest = (kind: 'vm' | 'lxc') => {
    const id = transaction(`workload.add.${kind}`, (run) => {
      const disk = pools[0]
        ? [{ poolId: pools[0].id, sizeBytes: (kind === 'vm' ? 32 : 8) * GiB }]
        : [];
      const base = { name: nextName(kind, names()), host, tagIds: [] };
      const workloadId = run(addWorkload, {
        workload:
          kind === 'vm'
            ? {
                ...base,
                kind,
                resources: { cpu: 2, memoryBytes: 4 * GiB, disks: disk },
                guestOs: { osId: 'debian', version: '12' },
              }
            : {
                ...base,
                kind,
                resources: { cpu: 1, memoryBytes: 1 * GiB, disks: disk },
                template: 'debian-12',
                unprivileged: true,
              },
      });
      // Network device net0 on the host bridge, like the Proxmox wizard (docs/02 § 6.1).
      if (bridge) {
        const nic = run(addInterface, {
          iface: {
            owner: { type: 'workload', id: workloadId },
            name: kind === 'vm' ? 'net0' : 'eth0',
            kind: 'vnic',
          },
        });
        run(connectInterfaces, { a: nic, b: bridge.id });
      }
      return workloadId;
    });
    if (id) setDetail({ type: 'workload', id });
  };

  const addContainer = () => {
    const network = Object.values(project.dockerNetworks).find(
      (n) => n.host.type === host.type && n.host.id === host.id,
    );
    const id = transaction('workload.add.container', (run) => {
      let networkId = network?.id;
      if (!networkId)
        networkId = run(addDockerNetwork, {
          network: { host, name: 'bridge', driver: 'bridge', subnet: '172.17.0.0/16' },
        });
      return run(addWorkload, {
        workload: {
          kind: 'container',
          name: nextName('container', names()),
          host,
          tagIds: [],
          image: 'nginx',
          tag: 'latest',
          network: { mode: 'docker-network', dockerNetworkId: networkId },
          portMappings: [],
          volumes: [],
        },
      });
    });
    if (id) setDetail({ type: 'workload', id });
  };

  const addCustomApp = () => {
    const id = transaction('app.add', (run) =>
      run(addApp, {
        app: {
          name: nextName(
            'app',
            Object.values(project.apps).map((a) => a.name),
          ),
          runsOn: host,
          role: 'app',
          tagIds: [],
          listeners: [],
          requirements: {
            min: { cpu: 0.5, memoryBytes: 0.5 * GiB, diskBytes: 1e9 },
            recommended: { cpu: 1, memoryBytes: 1 * GiB, diskBytes: 5e9 },
          },
          dependencies: [],
          trafficPatterns: [],
          confidence: 'estimated',
        },
      }),
    );
    if (id) setDetail({ type: 'app', id });
  };

  return (
    <Section title={t('software.workloads', { count: hosted.length + apps.length })}>
      {hosted.map((w) => (
        <OpenRow
          key={w.id}
          badge={badge(w)}
          name={w.name}
          meta={
            w.kind === 'container'
              ? `${w.image}:${w.tag}`
              : `${w.resources.cpu}c · ${formatSize(w.resources.memoryBytes)}`
          }
          onOpen={() => setDetail({ type: 'workload', id: w.id })}
        />
      ))}
      {apps.map((a) => (
        <OpenRow
          key={a.id}
          badge="APP"
          name={a.name}
          onOpen={() => setDetail({ type: 'app', id: a.id })}
        />
      ))}
      <div className="flex flex-wrap gap-1">
        {canVirtualize ? (
          <AddButton label={t('software.addVm')} onClick={() => addGuest('vm')} />
        ) : null}
        {canVirtualize ? (
          <AddButton label={t('software.addLxc')} onClick={() => addGuest('lxc')} />
        ) : null}
        {hasDocker ? <AddButton label={t('software.addContainer')} onClick={addContainer} /> : null}
        <AddButton label={t('software.addApp')} onClick={addCustomApp} />
      </div>
      {!canVirtualize && !hasDocker && host.type === 'device' ? (
        <p className="m-0 text-body-sm text-text-muted">{t('software.howToAdd')}</p>
      ) : null}
    </Section>
  );
}

/** The physical device at the bottom of a hosting chain (bounded walk). */
export function rootDevice(project: Project, host: HostRef): Device | undefined {
  let current: HostRef | undefined = host;
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (current.type === 'device') return project.devices[current.id];
    current = project.workloads[current.id]?.host;
  }
  return undefined;
}
