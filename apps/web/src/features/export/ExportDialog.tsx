import type { HostRef } from '@server-planner/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadBlob } from '../../app/download';
import { useServices, useSession } from '../../app/services';
import { getThemePreference, resolveTheme } from '../../app/theme';
import { useCatalog } from '../../catalog/store';
import { exportBlob, exportFileName } from '../../persistence/backup';
import { useResults } from '../../store/results';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { useSelection } from '../canvas/selection';
import { appRows, deviceRows, workloadRows } from '../inventory/rows';
import { ipPlan } from '../ipplan/plan';
import { containersOf, dockerCompose } from './compose';
import { appsCsv, bomCsv, devicesCsv, ipPlanCsv, workloadsCsv } from './csv';
import { downloadDataUrl, type ExportTheme, renderCanvas } from './image';
import { projectMarkdown } from './markdown';
import { useExportDialog } from './store';

type Format = 'png' | 'svg' | 'json' | 'csv' | 'md' | 'compose';
type Scope = 'all' | 'selection';
type Dataset = 'devices' | 'workloads' | 'apps' | 'ip' | 'bom';
const FORMATS: Format[] = ['png', 'svg', 'json', 'csv', 'md', 'compose'];
const DATASETS: Dataset[] = ['devices', 'workloads', 'apps', 'ip', 'bom'];

const text = (content: string, type: string) =>
  new Blob([content], { type: `${type};charset=utf-8` });

/**
 * D-04 Export (docs/07): PNG / SVG of the canvas or the selection, the project as JSON, tables as
 * CSV (EXP-03/04), documentation as Markdown (EXP-05) and docker-compose.yml (EXP-06).
 */
export function ExportDialog() {
  const { t } = useTranslation('editor');
  const { open, setOpen, canvas } = useExportDialog();
  const { session, repository } = useServices();
  const project = useSession((s) => s.project);
  const catalog = useCatalog((s) => s.catalog);
  const result = useResults((s) => s.result);
  const selected = useSelection((s) => s.nodeIds);
  const [format, setFormat] = useState<Format>('png');
  const [scope, setScope] = useState<Scope>('all');
  const [dataset, setDataset] = useState<Dataset>('devices');
  const [composeScope, setComposeScope] = useState('');
  const [theme, setTheme] = useState<ExportTheme>(() => resolveTheme(getThemePreference()));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [withSnapshots, setWithSnapshots] = useState(false);
  if (!project) return null;

  const effectiveScope: Scope = selected.length > 0 ? scope : 'all';
  const base = exportFileName(project).replace(/\.json$/, '');
  const image = format === 'png' || format === 'svg';

  // Compose targets: every host with containers, and every stack.
  const hostKey = (h: HostRef) => `${h.type}:${h.id}`;
  const composeTargets = [
    ...new Map(
      Object.values(project.workloads)
        .filter((w) => w.kind === 'container')
        .map((w) => [
          hostKey(w.host),
          {
            value: `host:${hostKey(w.host)}`,
            label: t('exportDialog.composeHost', {
              name:
                (w.host.type === 'device'
                  ? project.devices[w.host.id]
                  : project.workloads[w.host.id]
                )?.name ?? '?',
              count: containersOf(project, { host: w.host }).length,
            }),
          },
        ]),
    ).values(),
    ...Object.values(project.stacks).map((s) => ({
      value: `stack:${s.id}`,
      label: t('exportDialog.composeStack', {
        name: s.name,
        count: containersOf(project, { stackId: s.id }).length,
      }),
    })),
  ];
  const composeValue = composeTargets.some((c) => c.value === composeScope)
    ? composeScope
    : (composeTargets[0]?.value ?? '');

  const exportCompose = () => {
    const [kind, ...rest] = composeValue.split(':');
    if (kind === 'stack') {
      const stack = project.stacks[rest[0] ?? ''];
      if (!stack) return;
      const yml = dockerCompose(project, containersOf(project, { stackId: stack.id }), stack.name);
      downloadBlob(
        text(yml, 'application/yaml'),
        `${stack.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-docker-compose.yml`,
      );
      return;
    }
    const [type, id] = rest;
    if ((type !== 'device' && type !== 'workload') || !id) return;
    const host: HostRef = { type, id };
    const name = (type === 'device' ? project.devices[id] : project.workloads[id])?.name ?? 'host';
    const yml = dockerCompose(project, containersOf(project, { host }), name);
    downloadBlob(
      text(yml, 'application/yaml'),
      `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-docker-compose.yml`,
    );
  };

  const run = async () => {
    setFailed(false);
    if (format === 'json') {
      await session.flush();
      const current = session.getState().project;
      if (!current) return;
      const snapshots = withSnapshots
        ? (await repository.listSnapshots(current.id)).map(({ projectId: _, ...s }) => s)
        : [];
      downloadBlob(exportBlob(current, undefined, snapshots), exportFileName(current));
      await repository.recordExport();
    } else if (format === 'csv') {
      const csv =
        dataset === 'devices'
          ? devicesCsv(deviceRows(project, catalog, result))
          : dataset === 'workloads'
            ? workloadsCsv(workloadRows(project, result))
            : dataset === 'apps'
              ? appsCsv(appRows(project, catalog))
              : dataset === 'ip'
                ? ipPlanCsv(ipPlan(project))
                : bomCsv(project, catalog);
      downloadBlob(text(csv, 'text/csv'), `${base}-${dataset}.csv`);
    } else if (format === 'md') {
      const md = projectMarkdown(
        project,
        catalog,
        result,
        (issue) => t(`issues:${issue.code}.description`, issue.params),
        new Date().toISOString().slice(0, 10),
      );
      downloadBlob(text(md, 'text/markdown'), `${base}.md`);
    } else if (format === 'compose') {
      exportCompose();
    } else {
      const viewport = document.querySelector<HTMLElement>('.sp-canvas .react-flow__viewport');
      const nodes = (canvas?.getNodes() ?? []).filter(
        (n) => effectiveScope === 'all' || selected.includes(n.id),
      );
      if (!canvas || !viewport || nodes.length === 0) return;
      setBusy(true);
      try {
        const url = await renderCanvas(viewport, canvas.getNodesBounds(nodes), format, theme);
        downloadDataUrl(url, `${base}.${format}`);
      } catch {
        setFailed(true);
        return;
      } finally {
        setBusy(false);
      }
    }
    setOpen(false);
  };

  const disabled =
    busy || (image && !canvas) || (format === 'compose' && composeTargets.length === 0);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('exportDialog.title')}
      closeLabel={t('exportDialog.cancel')}
      width={560}
      footer={
        <>
          <Button onClick={() => setOpen(false)}>{t('exportDialog.cancel')}</Button>
          <Button variant="primary" disabled={disabled} onClick={() => void run()}>
            {busy
              ? t('exportDialog.working')
              : t('exportDialog.export', { format: t(`exportDialog.formats.${format}`) })}
          </Button>
        </>
      }
    >
      <Field label={t('exportDialog.format')}>
        <Segmented
          label={t('exportDialog.format')}
          value={format}
          onChange={setFormat}
          options={FORMATS.map((v) => ({ value: v, label: t(`exportDialog.formats.${v}`) }))}
        />
      </Field>
      <p className="m-0 text-body-sm text-text-secondary">{t(`exportDialog.hint.${format}`)}</p>
      {image && !canvas ? <Banner kind="info">{t('exportDialog.needsCanvas')}</Banner> : null}
      {image && canvas ? (
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
      {format === 'json' ? (
        <Checkbox
          label={t('exportDialog.withSnapshots')}
          checked={withSnapshots}
          onChange={(e) => setWithSnapshots(e.target.checked)}
        />
      ) : null}
      {format === 'csv' ? (
        <Field label={t('exportDialog.dataset')}>
          <Segmented
            label={t('exportDialog.dataset')}
            value={dataset}
            onChange={setDataset}
            options={DATASETS.map((d) => ({ value: d, label: t(`exportDialog.datasets.${d}`) }))}
          />
        </Field>
      ) : null}
      {format === 'compose' ? (
        composeTargets.length > 0 ? (
          <Select
            label={t('exportDialog.composeScope')}
            value={composeValue}
            onChange={(e) => setComposeScope(e.target.value)}
            options={composeTargets}
          />
        ) : (
          <Banner kind="info">{t('exportDialog.noContainers')}</Banner>
        )
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
