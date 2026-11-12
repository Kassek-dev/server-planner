import { PROJECT_TEMPLATES, type ProjectTemplate } from '@server-planner/model';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { TextField } from '../../../ui/TextField';

export type NewProjectStart = 'empty' | 'example' | ProjectTemplate;

/** D-01 New project (docs/07 § 6): empty, a starter template (PRJ-08) or the example. */
export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
  initialStart = 'empty',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, start: NewProjectStart) => void;
  initialStart?: NewProjectStart;
}) {
  const { t } = useTranslation('projects');
  const { t: tc } = useTranslation('common');
  const [name, setName] = useState(() => t('newDialog.defaultName'));
  const [start, setStart] = useState<NewProjectStart>(initialStart);
  const [error, setError] = useState<string | undefined>();

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim()) {
      setError(t('newDialog.nameRequired'));
      return;
    }
    onCreate(name.trim(), start);
  };

  const options: { value: NewProjectStart; label: string; hint: string }[] = [
    { value: 'empty', label: t('newDialog.empty'), hint: t('newDialog.emptyHint') },
    ...PROJECT_TEMPLATES.map((value) => ({
      value,
      label: t(`newDialog.templates.${value}.label`),
      hint: t(`newDialog.templates.${value}.hint`),
    })),
    { value: 'example', label: t('newDialog.example'), hint: t('newDialog.exampleHint') },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('newDialog.title')}
      closeLabel={tc('actions.close')}
      width={560}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{tc('actions.cancel')}</Button>
          <Button variant="primary" onClick={() => submit()}>
            {t('newDialog.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label={t('newDialog.name')}
          value={name}
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            setError(undefined);
          }}
          {...(error ? { error } : {})}
        />
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
            {t('newDialog.startWith')}
          </legend>
          {options.map((option) => (
            <label
              key={option.value}
              className={[
                'flex cursor-pointer gap-3 rounded-md border p-3',
                start === option.value
                  ? 'border-selection bg-accent-subtle'
                  : 'border-border-subtle bg-tile',
              ].join(' ')}
            >
              <input
                type="radio"
                name="start"
                value={option.value}
                checked={start === option.value}
                onChange={() => setStart(option.value)}
                className="mt-0.5 accent-accent"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{option.label}</span>
                <span className="text-body-sm text-text-secondary">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </form>
    </Dialog>
  );
}
