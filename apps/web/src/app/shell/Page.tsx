import type { ReactNode } from 'react';
import { TopBar } from './TopBar';

/** Full-page layout for P-* pages (docs/07 § 2). */
export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-app text-text-primary">
      <TopBar />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
