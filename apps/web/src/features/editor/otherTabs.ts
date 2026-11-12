import { useEffect, useState } from 'react';

/**
 * PRJ-06: detects the same project open in another tab of this browser (BroadcastChannel). Both
 * tabs autosave to IndexedDB, so the later save wins — the editor warns instead of locking.
 */

type Message =
  | { type: 'hello'; projectId: string; tab: string }
  | { type: 'here'; projectId: string; tab: string }
  | { type: 'bye'; projectId: string; tab: string };

const CHANNEL = 'server-planner:projects';

export function useOtherTabs(projectId: string): boolean {
  const [others, setOthers] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined' || !projectId) return;
    const tab = crypto.randomUUID();
    const channel = new BroadcastChannel(CHANNEL);
    const update = (fn: (s: Set<string>) => void) =>
      setOthers((prev) => {
        const next = new Set(prev);
        fn(next);
        return next;
      });
    channel.onmessage = (event: MessageEvent<Message>) => {
      const m = event.data;
      if (m.projectId !== projectId || m.tab === tab) return;
      if (m.type === 'bye') update((s) => s.delete(m.tab));
      else update((s) => s.add(m.tab));
      if (m.type === 'hello')
        channel.postMessage({ type: 'here', projectId, tab } satisfies Message);
    };
    channel.postMessage({ type: 'hello', projectId, tab } satisfies Message);
    const bye = () => channel.postMessage({ type: 'bye', projectId, tab } satisfies Message);
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      bye();
      channel.close();
      setOthers(new Set());
    };
  }, [projectId]);
  return others.size > 0;
}
