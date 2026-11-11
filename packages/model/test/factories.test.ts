import { describe, expect, it } from 'vitest';
import {
  createDevice,
  createProject,
  DEVICE_KINDS,
  nextDeviceName,
  sequentialContext,
} from '../src';

describe('factories', () => {
  const ctx = sequentialContext();
  const project = createProject('Lab', ctx);

  it('creates routers as rack-mount devices with a firewall and WAN + 3 LAN ports', () => {
    const { device, interfaces } = createDevice(project, 'router', ctx);
    expect(device.formFactor).toEqual({ mount: 'rack', units: 1, width: '19in' });
    expect(device.firewall?.defaultAction).toBe('deny');
    expect(interfaces.map((i) => i.name)).toEqual(['wan0', 'lan0', 'lan1', 'lan2']);
    expect(interfaces[0]?.kind).toBe('wan');
  });

  it('creates access points as ceiling devices with a PoE-powered port and a radio', () => {
    const { device, interfaces } = createDevice(project, 'access-point', ctx);
    expect(device.formFactor).toEqual({ mount: 'standalone', shape: 'ceiling' });
    expect(device.wifi).toEqual({ ssids: [] });
    expect(interfaces.map((i) => [i.kind, i.poe?.role])).toEqual([
      ['rj45', 'pd'],
      ['wifi-radio', undefined],
    ]);
  });

  it('gives the Internet node no form factor', () => {
    expect(createDevice(project, 'internet', ctx).device.formFactor).toBeUndefined();
  });

  it('has defaults for every device kind', () => {
    for (const kind of DEVICE_KINDS) {
      const { device, interfaces } = createDevice(project, kind, ctx);
      expect(device.kind).toBe(kind);
      for (const iface of interfaces)
        expect(iface.owner).toEqual({ type: 'device', id: device.id });
    }
  });

  it('generates the next free default name', () => {
    const p = createProject('Lab', ctx);
    expect(nextDeviceName(p, 'switch')).toBe('switch-1');
    const { device } = createDevice(p, 'switch', ctx);
    p.devices[device.id] = device;
    expect(nextDeviceName(p, 'switch')).toBe('switch-2');
  });

  it('sequential context is deterministic', () => {
    const a = sequentialContext();
    const b = sequentialContext();
    expect([a.createId('device'), a.createId('link')]).toEqual([
      b.createId('device'),
      b.createId('link'),
    ]);
    expect(a.createId('vlan')).toBe('vln_0003');
  });
});
