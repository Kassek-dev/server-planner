import {
  addApp,
  addDnsRecord,
  addFirewallRule,
  addNatRule,
  addProxyRoute,
  type Command,
  execute,
  ID_PREFIXES,
  type ModelContext,
  type Project,
  updateProject,
} from '../../src';
import { buildHomeLab } from './home-lab';

const MiB = 1024 ** 2;

/**
 * Home lab + schema v2 inputs: Caddy on docker-vm with a route for Jellyfin, port 443 forwarded
 * to Caddy, local DNS records (A, CNAME) and an own cable label pattern. IDs continue from 1000.
 */
export function buildReverseProxyLab(): Project {
  let counter = 1000;
  const ctx: ModelContext = {
    createId: (type) => {
      counter += 1;
      return `${ID_PREFIXES[type]}_${String(counter).padStart(4, '0')}` as never;
    },
    now: () => '2026-11-11T12:00:00.000Z',
  };
  let project = buildHomeLab();
  const run = <P, R>(command: Command<P, R>, payload: P): R => {
    const out = execute(project, command, payload, ctx);
    project = out.project;
    return out.result;
  };
  const byName = <T extends { name: string; id: string }>(
    items: Record<string, T>,
    name: string,
  ) => {
    const item = Object.values(items).find((x) => x.name === name);
    if (!item) throw new Error(`no ${name}`);
    return item.id;
  };
  const dockerVm = byName(project.workloads, 'docker-vm');
  const jellyfin = byName(project.apps, 'Jellyfin');
  const gw = byName(project.devices, 'gw-01');
  const wan = Object.values(project.interfaces).find((i) => i.owner.id === gw && i.name === 'wan0');
  if (!wan) throw new Error('no wan0');

  const caddy = run(addApp, {
    app: {
      name: 'Caddy',
      runsOn: { type: 'workload', id: dockerVm },
      role: 'proxy',
      tagIds: [],
      listeners: [
        { port: 80, protocol: 'tcp', purpose: 'http' },
        { port: 443, protocol: 'tcp', purpose: 'https' },
      ],
      requirements: {
        min: { cpu: 0.1, memoryBytes: 128 * MiB, diskBytes: 100 * MiB },
        recommended: { cpu: 0.5, memoryBytes: 256 * MiB, diskBytes: 512 * MiB },
      },
      dependencies: [],
      trafficPatterns: [],
      confidence: 'estimated',
    },
  });
  run(addProxyRoute, {
    route: {
      hostname: 'jellyfin.home.arpa',
      proxyAppId: caddy,
      target: { appId: jellyfin, port: 8096 },
      tls: true,
    },
  });
  run(addNatRule, {
    deviceId: gw,
    rule: {
      kind: 'port-forward',
      inInterfaceId: wan.id,
      protocol: 'tcp',
      externalPort: 443,
      target: { appId: caddy, port: 443 },
    },
  });
  run(addFirewallRule, {
    deviceId: gw,
    rule: {
      enabled: true,
      action: 'allow',
      protocol: 'tcp',
      source: { type: 'internet' },
      destination: { type: 'app', id: caddy },
      ports: [{ from: 443, to: 443 }],
      description: 'HTTPS to Caddy',
    },
  });
  run(addDnsRecord, {
    record: { type: 'A', name: 'jellyfin.home.arpa', value: '192.168.20.15' },
  });
  run(addDnsRecord, {
    record: { type: 'A', name: 'nas.home.arpa', value: '192.168.20.15' },
  });
  run(addDnsRecord, {
    record: { type: 'CNAME', name: 'media.home.arpa', value: 'jellyfin.home.arpa' },
  });
  run(updateProject, {
    changes: { settings: { cableLabelPattern: '{a.device}:{a.port} - {b.device}:{b.port}' } },
  });
  return project;
}
