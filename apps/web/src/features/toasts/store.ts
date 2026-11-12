import { create } from 'zustand';
import type { HistoryEntry } from '../../store/projectSession';

/** O-12 toasts: short confirmations, optionally with Undo for the step that caused them. */
export interface Toast {
  id: number;
  message: { key: string; params?: Record<string, string | number> };
  /** The undo step this toast can revert (only while it is still the latest step). */
  undo?: HistoryEntry;
}

export interface ToastState {
  toasts: Toast[];
  push(toast: Omit<Toast, 'id'>): number;
  dismiss(id: number): void;
}

let nextId = 1;
/** At most this many toasts on screen; older ones give way. */
const MAX_TOASTS = 3;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push(toast) {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }].slice(-MAX_TOASTS) }));
    return id;
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
