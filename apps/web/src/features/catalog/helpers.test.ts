import { describe, expect, it } from 'vitest';
import { homeLab } from '../canvas/testSupport';
import { modelName, portSummary } from './DeviceModelPicker';
import { appHosts, defaultHost, nextFreePort, takenPorts } from './helpers';

const lab = homeLab();
const vm = Object.values(lab.workloads).find((w) => w.name === 'docker-vm');

describe('catalog helpers', () => {
  it('offers compute devices and guests as app hosts', () => {
    const labels = appHosts(lab).map((h) => h.label);
    expect(labels).toContain('pve1');
    expect(labels).toContain('docker-vm · VM · pve1');
    expect(labels).not.toContain('sw-core');
  });

  it('defaults to the selected guest, then the selected device', () => {
    const none = { nodeIds: [], detail: null };
    expect(
      defaultHost(lab, undefined, { ...none, detail: { type: 'workload', id: vm?.id ?? '' } }),
    ).toEqual({
      type: 'workload',
      id: vm?.id,
    });
    const switchId = Object.values(lab.devices).find((d) => d.name === 'sw-core')?.id ?? '';
    // A switch cannot host apps: fall back to the first host.
    expect(defaultHost(lab, undefined, { ...none, nodeIds: [switchId] })).toBeDefined();
  });

  it('finds published ports and the next free one', () => {
    const taken = takenPorts(lab, { type: 'workload', id: vm?.id ?? '' });
    expect(taken.has('tcp/8096')).toBe(true);
    expect(nextFreePort(taken, 'tcp', 8096)).toBe(8097);
    expect(nextFreePort(taken, 'udp', 8096)).toBe(8096);
  });

  it('formats model names and port summaries', () => {
    expect(modelName({ vendor: 'Raspberry Pi', model: 'Raspberry Pi 5 (8 GB)' })).toBe(
      'Raspberry Pi 5 (8 GB)',
    );
    expect(modelName({ vendor: 'Lenovo', model: 'ThinkCentre M720q Tiny' })).toBe(
      'Lenovo ThinkCentre M720q Tiny',
    );
    expect(portSummary([...Array(24).fill(1000), 10000, 10000])).toBe('24 × 1G · 2 × 10G');
    expect(portSummary([2500, 100])).toBe('1 × 100M · 1 × 2.5G');
  });
});
