import { useTranslation } from 'react-i18next';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';

/** D-03 — the only confirmation dialog for deletion (U4, docs/05 UI3). */
export function DeleteDialog({
  name,
  onClose,
  onExport,
  onDelete,
}: {
  name: string;
  onClose: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('projects');
  const { t: tc } = useTranslation('common');
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('deleteDialog.title')}
      description={t('deleteDialog.description', { name })}
      closeLabel={tc('actions.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onExport}>
            {t('deleteDialog.exportFirst')}
          </Button>
          <div className="grow" />
          <Button onClick={onClose}>{tc('actions.cancel')}</Button>
          <Button variant="danger" onClick={onDelete}>
            {t('deleteDialog.confirm')}
          </Button>
        </>
      }
    />
  );
}
