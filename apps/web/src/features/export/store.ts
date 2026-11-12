import type { Node, Rect } from '@xyflow/react';
import { create } from 'zustand';

/** What image export needs from the canvas; registered while the Topology view is mounted. */
export interface CanvasHandle {
  getNodes(): Node[];
  getNodesBounds(nodes: Node[]): Rect;
}

/** D-04 is opened from the top bar in any view; image formats need the canvas. */
export const useExportDialog = create<{
  open: boolean;
  canvas: CanvasHandle | null;
  setOpen(open: boolean): void;
}>((set) => ({
  open: false,
  canvas: null,
  setOpen: (open) => set({ open }),
}));
