import { describe, expect, it } from 'vitest';
import { panelParam, parsePanel } from './useDrawer';

describe('panel param', () => {
  it('round-trips drawer panels', () => {
    for (const panel of [
      { kind: 'vlans' },
      { kind: 'tags' },
      { kind: 'settings' },
      { kind: 'firewall', deviceId: 'dev_1' },
    ] as const) {
      expect(parsePanel(panelParam(panel))).toEqual(panel);
    }
  });
  it('ignores unknown values', () => {
    expect(parsePanel('nope')).toBeNull();
    expect(parsePanel(null)).toBeNull();
  });
});
