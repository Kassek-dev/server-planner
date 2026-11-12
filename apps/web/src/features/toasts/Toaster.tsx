import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices, useSession } from '../../app/services';
import { type Toast, useToasts } from './store';

/** How long a toast stays (ms); after that Ctrl+Z still undoes the step. */
const DURATION_MS = 8000;

/** O-12 toast stack, bottom centre of the editor; announced politely to screen readers. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const { t } = useTranslation('editor');
  const { session } = useServices();
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [dismiss, toast.id]);

  // Undo only while the step is still the latest one — never revert someone else's change.
  const latest = useSession((s) => s.past.at(-1));
  const canUndo = !!toast.undo && latest === toast.undo;
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-border-default bg-raised py-2 pr-2 pl-3.5 text-body text-text-primary shadow-overlay">
      <span>{t(`toasts.${toast.message.key}`, toast.message.params ?? {})}</span>
      {toast.undo && canUndo ? (
        <button
          type="button"
          className="rounded-md px-2 py-1 font-medium text-accent-text hover:bg-tile-header"
          onClick={() => {
            session.undo();
            dismiss(toast.id);
          }}
        >
          {t('toasts.undo')}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={t('toasts.dismiss')}
        className="flex size-6 items-center justify-center rounded-md text-text-secondary hover:bg-tile-header"
        onClick={() => dismiss(toast.id)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
