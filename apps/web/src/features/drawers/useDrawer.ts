import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/** Open drawer kept in `?panel=` (docs/07 § 0): vlans | firewall:<deviceId> | tags | settings. */
export type DrawerPanel =
  | { kind: 'vlans' }
  | { kind: 'firewall'; deviceId: string }
  | { kind: 'tags' }
  | { kind: 'settings' };

export function parsePanel(value: string | null): DrawerPanel | null {
  if (value === 'vlans' || value === 'tags' || value === 'settings') return { kind: value };
  if (value?.startsWith('firewall:'))
    return { kind: 'firewall', deviceId: value.slice('firewall:'.length) };
  return null;
}

export const panelParam = (panel: DrawerPanel): string =>
  panel.kind === 'firewall' ? `firewall:${panel.deviceId}` : panel.kind;

export function useDrawer() {
  const [params, setParams] = useSearchParams();
  const panel = parsePanel(params.get('panel'));
  const set = useCallback(
    (next: DrawerPanel | null) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set('panel', panelParam(next));
          else p.delete('panel');
          return p;
        },
        { replace: false },
      ),
    [setParams],
  );
  return { panel, open: set, close: () => set(null) };
}
