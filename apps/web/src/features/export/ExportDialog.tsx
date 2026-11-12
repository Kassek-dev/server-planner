import { useReactFlow } from '@xyflow/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadBlob } from '../../app/download';
import { useServices, useSession } from '../../app/services';
import { getThemePreference, resolveTheme } from '../../app/theme';
import { exportBlob, exportFileName } from '../../persistence/backup';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Segmented } from '../../ui/Segmented';
import { useSelection } from '../canvas/selection';
import { downloadDataUrl, type ExportTheme, renderCanvas } from './image';
import { useExportDialog } from './store';

type Format = 'png' | 'svg' | 'json';
type Scope = 'all' | 'selection';

/** D-04 Export (docs/07): PNG / SVG of the canvas or the selection, or the project as JSON. */
export function ExportDialog() {
  const { t } = useTranslation('editor');
  const { open, setOpen } = useExportDialog();
  const { session, repository } = useServices();
  const project = useSession((s) => s.project);
  const flow = useReactFlow();
  const selected = useSelection((s) => s.nodeIds);
  const [format, setFormat] = useState<Format>('png');
  const [scope, setScope] = useState<Scope>('all');
  const [theme, setTheme] = useState<ExportTheme>(() => resolveTheme(getThemePreference()));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!project) return null;

  const effectiveScope: Scope = selected.length > 0 ? scope : 'all';
  const base = exportFileName(project).replace(/\.json$/, '');

  const run = async () => {
    setFailed(false);
    if (format === 'json') {
      await session.flush();
      const current = session.getState().project;
      if (!current) return;
      downloadBlob(exportBlob(current), exportFileName(current));
      await repository.recordExport();
      setOpen(false);
      return;
    }
    const viewport = document.querySelector<HTMLElement>('.sp-canvas .react-flow__viewport');
    const nodes = flow
      .getNodes()
      .filter((n) => effectiveScope === 'all' || selected.includes(n.id));
    if (!viewport || nodes.length === 0) return;
    setBusy(true);
    try {
      const url = await renderCanvas(viewport, flow.getNodesBounds(nodes), format, theme);
      downloadDataUrl(url, `${base}.${format}`);
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('exportDialog.title')}
      closeLabel={t('exportDialog.cancel')}
      footer={
        <>
          <Button onClick={() => setOpen(false)}>{t('exportDialog.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void run()}>
            {busy
              ? t('exportDialog.working')
              : t('exportDialog.export', { format: format.toUpperCase() })}
          </Button>
        </>
      }
    >
      <Field label={t('exportDialog.format')}>
        <Segmented
          label={t('exportDialog.format')}
          value={format}
          onChange={setFormat}
          options={(['png', 'svg', 'json'] as const).map((v) => ({
            value: v,
            label: v.toUpperCase(),
          }))}
        />
      </Field>
      <p className="m-0 text-body-sm text-text-secondary">{t(`exportDialog.hint.${format}`)}</p>
      {format !== 'json' ? (
        <>
          <Field label={t('exportDialog.scope')}>
            <Segmented
              label={t('exportDialog.scope')}
              value={effectiveScope}
              onChange={setScope}
              options={[
                { value: 'all', label: t('exportDialog.all') },
                ...(selected.length > 0
                  ? [
                      {
                        value: 'selection' as const,
                        label: t('exportDialog.selection', { count: selected.length }),
                      },
                    ]
                  : []),
              ]}
            />
          </Field>
          <Field label={t('exportDialog.background')}>
            <Segmented
              label={t('exportDialog.background')}
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'dark', label: t('exportDialog.dark') },
                { value: 'light', label: t('exportDialog.light') },
              ]}
            />
          </Field>
        </>
      ) : null}
      {failed ? <Banner kind="error">{t('exportDialog.failed')}</Banner> : null}
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        aria-hidden="true"
        className="font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase"
      >
        {label}
      </span>
      {children}
    </div>
  );
}
