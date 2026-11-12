import { create } from 'zustand';

/** D-04 is opened from the top bar but rendered inside the canvas (it needs React Flow). */
export const useExportDialog = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
