import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Dialog — docs/04 § 6.14: 480/640 wide (catalog pickers 1040/1120), actions on the right (primary
 * last), Esc closes. `flush` drops the body padding for multi-column layouts.
 */
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  closeLabel: string;
  width?: 480 | 560 | 640 | 1040 | 1120;
  flush?: boolean;
  children?: ReactNode;
  footer: ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  width = 480,
  flush = false,
  children,
  footer,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-app/70" />
        <RadixDialog.Content
          style={{ width }}
          className="fixed top-1/2 left-1/2 flex max-h-[90vh] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-border-default bg-raised text-text-primary shadow-overlay"
        >
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle pr-3 pl-5">
            <RadixDialog.Title className="m-0 text-title font-semibold">{title}</RadixDialog.Title>
            <div className="grow" />
            <RadixDialog.Close
              aria-label={closeLabel}
              className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-tile-header"
            >
              <X size={18} aria-hidden="true" />
            </RadixDialog.Close>
          </header>
          <div className={`flex min-h-0 flex-1 flex-col overflow-auto ${flush ? '' : 'gap-4 p-5'}`}>
            {description ? (
              <RadixDialog.Description
                className={`m-0 text-text-secondary ${flush ? 'sr-only' : ''}`}
              >
                {description}
              </RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
            {children}
          </div>
          <footer className="flex h-15 shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5">
            {footer}
          </footer>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
