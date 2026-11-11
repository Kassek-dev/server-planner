import { useTranslation } from 'react-i18next';
import { Page } from '../shell/Page';

/** Temporary page for routes implemented in later MVP stages (docs/03 § 11). */
export function PlaceholderPage({ titleKey, stage }: { titleKey: string; stage: number }) {
  const { t } = useTranslation('common');
  return (
    <Page>
      <div className="flex flex-col gap-2 p-8">
        <h1 className="m-0 text-title-lg font-semibold">{t(titleKey)}</h1>
        <p className="m-0 text-text-secondary">{t('placeholder.description', { stage })}</p>
      </div>
    </Page>
  );
}
