import { GitBranch } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { create } from 'zustand';
import { useServices, useSession } from '../../app/services';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/TextField';

export const useVariantDialog = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** PRJ-10 link of a project: `undefined` while loading, `{}` for a project that is no variant. */
export function useVariantOf(projectId: string): { baseId?: string } | undefined {
  const { repository } = useServices();
  const [link, setLink] = useState<{ id: string; baseId?: string }>();
  useEffect(() => {
    let cancelled = false;
    void repository.getMeta(projectId).then((meta) => {
      if (!cancelled)
        setLink({ id: projectId, ...(meta?.variantOf ? { baseId: meta.variantOf } : {}) });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, repository]);
  if (link?.id !== projectId) return undefined;
  return link.baseId ? { baseId: link.baseId } : {};
}

/**
 * D-18 Create variant (PRJ-10): saves the open project, copies it as a variant linked to it and
 * opens the copy on its Compare view.
 */
export function CreateVariantDialog() {
  const { t } = useTranslation('editor');
  const { repository, session } = useServices();
  const open = useVariantDialog((s) => s.open);
  const project = useSession((s) => s.project);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // Fill the name each time the dialog opens, not while the project changes underneath.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on open only
  useEffect(() => {
    if (open && project) setName(t('variant.defaultName', { name: project.name }));
  }, [open]);
  if (!open || !project) return null;
  const close = () => useVariantDialog.getState().setOpen(false);
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await session.flush();
      const variant = await repository.createVariant(project.id, trimmed);
      close();
      navigate(`/p/${variant.id}/compare`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && close()}
      title={t('variant.title')}
      description={t('variant.description')}
      closeLabel={t('variant.cancel')}
      footer={
        <>
          <Button onClick={close}>{t('variant.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!name.trim() || busy}
            icon={<GitBranch size={14} aria-hidden="true" />}
            onClick={() => void submit()}
          >
            {t('variant.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)}>
        <TextField
          label={t('variant.name')}
          value={name}
          maxLength={120}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </Dialog>
  );
}
