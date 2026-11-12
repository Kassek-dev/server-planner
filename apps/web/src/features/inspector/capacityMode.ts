import type { CapacityMode, CapacityReport } from '@server-planner/engine';
import { create } from 'zustand';
import { useResults } from '../../store/results';

/** Capacity tab mode (CAP-05): allocated vs expected use; shared by all hosts while editing. */
export const useCapacityMode = create<{ mode: CapacityMode; set(mode: CapacityMode): void }>(
  (set) => ({ mode: 'allocated', set: (mode) => set({ mode }) }),
);

/** The host's capacity report in the chosen mode. */
export function useHostReport(id: string): CapacityReport | undefined {
  const mode = useCapacityMode((s) => s.mode);
  return useResults((s) => (mode === 'expected' ? s.result?.expected[id] : s.result?.capacity[id]));
}
