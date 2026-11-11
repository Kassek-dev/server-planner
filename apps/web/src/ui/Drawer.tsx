import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/** Drawer (docs/04 § 6, docs/07 S-*): 720 px panel over the canvas from the right; Esc closes. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  closeLabel: string;
  children: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 top-13 bg-app/60" />
        <RadixDialog.Content className="fixed top-13 right-0 bottom-0 flex w-180 max-w-full flex-col border-l border-border-default bg-panel text-text-primary shadow-overlay">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border-subtle pr-3 pl-5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <RadixDialog.Title className="m-0 truncate text-title font-semibold">
                {title}
              </RadixDialog.Title>
              <RadixDialog.Description className="m-0 truncate text-body-sm text-text-secondary">
                {subtitle ?? title}
              </RadixDialog.Description>
            </div>
            <div className="grow" />
            <RadixDialog.Close
              aria-label={closeLabel}
              className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-tile-header"
            >
              <X size={18} aria-hidden="true" />
            </RadixDialog.Close>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-4">
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
