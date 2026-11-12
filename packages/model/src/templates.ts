import { type Command, execute } from './commands/core';
import { addDevice, updateDevice } from './commands/device';
import { connectInterfaces, updateInterface } from './commands/network';
import { applySegmentation } from './commands/segmentation';
import { createProject, defaultContext, type ModelContext } from './factories';
import type { Hardware } from './schema/hardware';
import type { Project } from './schema/project';

/** PRJ-08 starter templates: small, valid projects built from the same commands as the UI. */

export const PROJECT_TEMPLATES = ['mini-pc-router', 'proxmox-cluster', 'iot-segmentation'] as const;
export type ProjectTemplate = (typeof PROJECT_TEMPLATES)[number];

const GiB = 1024 ** 3;
const GB = 1e9;

/** A typical used office mini PC: 6 cores, 32 GB RAM, one NVMe SSD as a single pool. */
function miniPcHardware(ctx: ModelContext): Hardware {
  const disk = ctx.createId('disk');
  return {
    cpus: [
      { model: 'Intel Core i5-8500T', arch: 'amd64', cores: 6, threads: 6, baseGhz: 2.1, tdpW: 35 },
    ],
    memory: { modules: [{ sizeBytes: 16 * GiB, count: 2 }], type: 'DDR4', slotsTotal: 2 },
    disks: [{ id: disk, name: 'nvme0', type: 'ssd-nvme', sizeBytes: 512 * GB }],
    pools: [
      {
        id: ctx.createId('storagePool'),
        name: 'local',
        layout: 'single',
        diskIds: [disk],
        purpose: ['os', 'vm-disks', 'containers'],
      },
    ],
    gpus: [{ model: 'Intel UHD Graphics 630', features: ['quicksync'] }],
    power: { idleW: 8, loadW: 35 },
  };
}

export function createFromTemplate(
  template: ProjectTemplate,
  name: string,
  ctx: ModelContext = defaultContext,
): Project {
  let project = createProject(name, ctx);
  const run = <P, R>(command: Command<P, R>, payload: P): R => {
    const out = execute(project, command, payload, ctx);
    project = out.project;
    return out.result;
  };
  const port = (deviceId: string, portName: string) => {
    const found = Object.values(project.interfaces).find(
      (i) => i.owner.id === deviceId && i.name === portName,
    );
    if (!found) throw new Error(`No ${portName} on ${deviceId}`);
    return found.id;
  };
  const connect = (a: [string, string], b: [string, string]) =>
    run(connectInterfaces, { a: port(...a), b: port(...b) });
  const device = (
    kind: Parameters<typeof addDevice.run>[1]['kind'],
    deviceName: string,
    x: number,
    y: number,
  ) => run(addDevice, { kind, name: deviceName, position: { x, y } }).deviceId;
  const host = (deviceName: string, x: number, y: number, osId: 'proxmox-ve' | 'debian') => {
    const id = device('mini-pc', deviceName, x, y);
    run(updateDevice, {
      id,
      changes: {
        hardware: miniPcHardware(ctx),
        os: { osId, version: osId === 'proxmox-ve' ? '8' : '12' },
      },
    });
    return id;
  };

  const internet = device('internet', 'Internet', 20, 0);
  const router = device('router', 'router', 20, 8);
  connect([internet, 'wan'], [router, 'wan0']);

  switch (template) {
    case 'mini-pc-router': {
      const pc = host('mini-pc', 20, 18, 'debian');
      connect([router, 'lan0'], [pc, 'eth0']);
      break;
    }
    case 'proxmox-cluster': {
      const sw = device('switch', 'switch', 20, 16);
      connect([router, 'lan0'], [sw, 'Port 1']);
      for (const n of [1, 2, 3]) {
        const pve = host(`pve${n}`, 4 + (n - 1) * 16, 26, 'proxmox-ve');
        connect([sw, `Port ${n + 1}`], [pve, 'eth0']);
      }
      break;
    }
    case 'iot-segmentation': {
      const sw = device('switch', 'switch', 20, 16);
      const ap = device('access-point', 'ap', 36, 26);
      const pc = host('server', 4, 26, 'debian');
      connect([router, 'lan0'], [sw, 'Port 1']);
      connect([sw, 'Port 2'], [pc, 'eth0']);
      connect([sw, 'Port 8'], [ap, 'eth0']);
      run(applySegmentation, {
        routerId: router,
        trunkInterfaceId: port(router, 'lan0'),
        segments: ['mgmt', 'lan', 'iot', 'guest'],
      });
      // Uplink and AP carry every VLAN; the server sits in LAN.
      const lan = Object.values(project.vlans).find((v) => v.vid === 20)?.id;
      for (const p of ['Port 1', 'Port 8'])
        run(updateInterface, {
          id: port(sw, p),
          changes: { switchport: { mode: 'trunk', allowedVlanIds: 'all' } },
        });
      run(updateInterface, {
        id: port(sw, 'Port 2'),
        changes: { switchport: { mode: 'access', ...(lan ? { accessVlanId: lan } : {}) } },
      });
      run(updateInterface, {
        id: port(pc, 'eth0'),
        changes: { addresses: [{ mode: 'dhcp' }] },
      });
      break;
    }
  }
  return project;
}
