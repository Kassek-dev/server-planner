import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

/** Popover menu — docs/04 § 6.14: bg-raised, 30 px rows, danger items in error text. */
export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function Menu({
  trigger,
  items,
  align = 'end',
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className="min-w-44 rounded-md border border-border-default bg-raised p-1 text-body text-text-primary shadow-overlay"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              disabled={item.disabled ?? false}
              onSelect={item.onSelect}
              className={[
                'flex h-7.5 cursor-default items-center rounded-sm px-2.5 outline-none select-none',
                'data-[disabled]:opacity-45 data-[highlighted]:bg-tile-header',
                item.danger ? 'text-error-text' : '',
              ].join(' ')}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
