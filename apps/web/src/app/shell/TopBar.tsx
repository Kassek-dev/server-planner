import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/** App top bar (52 px) — docs/04 § 4.2, docs/05 § 3. */
export function TopBar({ children, nav = true }: { children?: ReactNode; nav?: boolean }) {
  const { t } = useTranslation('common');
  return (
    <header className="flex h-13 shrink-0 items-center gap-3.5 border-b border-border-subtle bg-panel px-4">
      <Link to="/" className="flex items-center gap-2.5 text-text-primary no-underline">
        <Logo />
        <span className={`text-body-strong font-semibold ${nav ? '' : 'max-md:sr-only'}`}>
          {t('appName')}
        </span>
      </Link>
      {children}
      {nav ? <div className="grow" /> : null}
      {nav ? (
        <nav className="flex items-center gap-4" aria-label={t('appName')}>
          <Link
            to="/settings/appearance"
            className="text-text-secondary no-underline hover:text-text-primary"
          >
            {t('nav.settings')}
          </Link>
          <Link
            to="/about/overview"
            className="text-text-secondary no-underline hover:text-text-primary"
          >
            {t('nav.about')}
          </Link>
        </nav>
      ) : null}
    </header>
  );
}

function Logo() {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 flex-col justify-center gap-0.75 rounded-md bg-accent px-1.5"
    >
      <span className="h-0.75 bg-on-accent" />
      <span className="h-0.75 bg-on-accent" />
      <span className="h-0.75 bg-on-accent" />
    </span>
  );
}
