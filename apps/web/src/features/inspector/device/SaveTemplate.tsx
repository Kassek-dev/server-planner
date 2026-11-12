import { type Device, deviceTemplateFrom } from '@server-planner/model';
import { BookmarkPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices, useSession } from '../../../app/services';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { TextField } from '../../../ui/TextField';
import { useDeviceTemplates } from '../../canvas/deviceTemplates';

/** LIB-04 "Save as template": the device's hardware, OS and ports for the library. */
export function SaveTemplate({ device }: { device: Device }) {
  const { t } = useTranslation('inspector');
  const { repository } = useServices();
  const project = useSession((s) => s.project);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const save = async () => {
    if (!project || !name.trim()) return;
    const template = deviceTemplateFrom(project, device.id, {
      id: `tpl_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    });
    await useDeviceTemplates.getState().save(repository, template);
    setOpen(false);
    setSaved(true);
  };
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onClick={() => {
          setName(device.name);
          setSaved(false);
          setOpen(true);
        }}
      >
        <BookmarkPlus size={14} aria-hidden="true" />
        {t('template.save')}
      </Button>
      {saved ? (
        <p role="status" className="m-0 text-body-sm text-text-secondary">
          {t('template.saved')}
        </p>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('template.title')}
        description={t('template.description')}
        closeLabel={t('template.cancel')}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t('template.cancel')}</Button>
            <Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>
              {t('template.confirm')}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <TextField
            label={t('template.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </form>
      </Dialog>
    </>
  );
}
