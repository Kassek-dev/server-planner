import { SCHEMA_VERSION } from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import type { ImportError, ImportResult } from '../../../persistence/backup';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';

/** D-02 Import result: summary, migration info, copy notice, or a readable error. */
export function ImportResultDialog({
  result,
  error,
  onClose,
  onOpen,
}: {
  result?: ImportResult;
  error?: ImportError;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation('projects');
  const { t: tc } = useTranslation('common');
  const devices = result
    ? Object.values(result.project.devices).filter((d) => d.kind !== 'internet').length
    : 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('importDialog.title')}
      closeLabel={tc('actions.close')}
      footer={
        result ? (
          <>
            <Button onClick={onClose}>{t('importDialog.close')}</Button>
            <Button variant="primary" onClick={() => onOpen(result.project.id)}>
              {t('importDialog.open')}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>{t('importDialog.close')}</Button>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="m-0">{t('importDialog.success', { name: result.project.name, devices })}</p>
          {result.migratedFrom !== undefined ? (
            <Banner kind="info">
              {t('importDialog.migrated', { from: result.migratedFrom, to: SCHEMA_VERSION })}
            </Banner>
          ) : null}
          {result.asCopy ? <Banner kind="info">{t('importDialog.asCopy')}</Banner> : null}
          {result.snapshotCount > 0 ? (
            <Banner kind="warning">
              {t('importDialog.snapshotsSkipped', { count: result.snapshotCount })}
            </Banner>
          ) : null}
        </div>
      ) : error ? (
        <Banner kind="error">
          <span className="font-semibold">{t('importDialog.failed')}</span>{' '}
          {t(`importDialog.errors.${error.code}`, error.params)}
        </Banner>
      ) : null}
    </Dialog>
  );
}
