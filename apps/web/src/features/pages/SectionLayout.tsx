import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Page } from '../../app/shell/Page';

/** P-02 / P-03 layout (docs/07): section navigation (240 px) on the left, content on the right. */
export function SectionLayout({
  title,
  base,
  sections,
  children,
}: {
  title: string;
  base: string;
  sections: { id: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <Page>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={title}
          className="flex w-60 shrink-0 flex-col gap-0.5 border-r border-border-subtle px-4 py-6"
        >
          <span className="px-3 pb-3 text-title font-semibold">{title}</span>
          {sections.map((s) => (
            <NavLink
              key={s.id}
              to={`${base}/${s.id}`}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 no-underline ${
                  isActive
                    ? 'bg-tile-header font-medium text-text-primary shadow-[inset_2px_0_0_var(--sp-accent)]'
                    : 'text-text-secondary hover:text-text-primary'
                }`
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="flex max-w-225 flex-col gap-6 px-12 py-8">{children}</div>
        </div>
      </div>
    </Page>
  );
}

export function PageTitle({ children }: { children: string }) {
  return <h1 className="m-0 text-title-lg font-semibold">{children}</h1>;
}

/** Setting card: title and explanation on the left, control on the right. */
export function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="flex items-center gap-6 rounded-md border border-border-subtle bg-panel p-4">
      <div className="flex flex-1 flex-col gap-1">
        <h2 className="m-0 text-body font-semibold">{title}</h2>
        <p className="m-0 text-body-sm leading-normal text-text-secondary">{description}</p>
      </div>
      {children}
    </section>
  );
}
