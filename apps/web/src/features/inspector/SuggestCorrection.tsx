import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** CAT-06: opens a prefilled GitHub issue in a new tab (the app itself sends nothing). */
export function SuggestCorrection({ href }: { href: string }) {
  const { t } = useTranslation('inspector');
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-fit items-center gap-1 text-body-sm text-accent-text hover:underline"
    >
      <ExternalLink size={12} aria-hidden="true" />
      {t('catalog.suggest')}
    </a>
  );
}
