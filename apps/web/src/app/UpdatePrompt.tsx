import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** PWA (docs/05 § 11): a new version is waiting — reload when the user is ready, never by force. */
export function UpdatePrompt() {
  const { t } = useTranslation('common');
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-md border border-border-default bg-raised py-2 pr-2 pl-3.5 text-body text-text-primary shadow-overlay"
    >
      <span>{t('update.available')}</span>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-accent-text hover:bg-tile-header"
      >
        <RefreshCw size={14} aria-hidden="true" />
        {t('update.reload')}
      </button>
      <button
        type="button"
        aria-label={t('update.later')}
        onClick={() => setNeedRefresh(false)}
        className="flex size-6 items-center justify-center rounded-md text-text-secondary hover:bg-tile-header"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
