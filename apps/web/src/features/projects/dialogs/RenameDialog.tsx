import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { TextField } from '../../../ui/TextField';

export function RenameDialog({
  initialName,
  onClose,
  onRename,
}: {
  initialName: string;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const { t } = useTranslation('projects');
  const { t: tc } = useTranslation('common');
  const [name, setName] = useState(initialName);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (name.trim()) onRename(name.trim());
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('renameDialog.title')}
      closeLabel={tc('actions.close')}
      footer={
        <>
          <Button onClick={onClose}>{tc('actions.cancel')}</Button>
          <Button variant="primary" onClick={() => submit()} disabled={!name.trim()}>
            {t('renameDialog.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <TextField
          label={t('newDialog.name')}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </Dialog>
  );
}
