import { analyze } from '@server-planner/engine';
import { describe, expect, it } from 'vitest';
import { homeLab } from '../canvas/testSupport';
import { appRows, deviceRows, workloadRows } from './rows';

const lab = homeLab();
const result = analyze(lab);

describe('inventory rows', () => {
  it('lists devices (without the Internet node) with location, hardware and engine status', () => {
    const rows = deviceRows(lab, null, result);
    expect(rows.some((r) => r.kind === 'internet')).toBe(false);
    const pve = rows.find((r) => r.name === 'pve1');
    expect(pve).toMatchObject({ location: 'Office shelf', os: 'Proxmox VE 8.3', workloads: 4 });
    expect(pve?.memoryBytes).toBe(32 * 1024 ** 3);
    expect(rows.find((r) => r.name === 'tv-salon')?.internet).toBe('none');
  });

  it('lists workloads with host chain and container images', () => {
    const rows = workloadRows(lab, result);
    expect(rows.find((r) => r.name === 'jellyfin')).toMatchObject({
      kind: 'container',
      host: 'docker-vm',
      device: 'pve1',
      image: 'lscr.io/linuxserver/jellyfin:latest',
    });
    expect(rows.find((r) => r.name === 'docker-vm')?.capacity).toBe('critical');
  });

  it('lists apps with published ports', () => {
    const rows = appRows(lab, null);
    expect(rows[0]).toMatchObject({
      name: 'Jellyfin',
      host: 'jellyfin',
      device: 'pve1',
      ports: '8096/tcp',
    });
  });
});
