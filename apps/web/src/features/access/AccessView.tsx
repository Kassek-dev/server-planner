import type {
  AccessMatrix,
  EntityRef,
  Exposure,
  MatrixCell,
  ReachabilityResult,
} from '@server-planner/engine';
import {
  type Assertion,
  deleteAssertion,
  type Project,
  updateAssertion,
} from '@server-planner/model';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useServices, useSession } from '../../app/services';
import { useResults } from '../../store/results';
import { Button } from '../../ui/Button';
import { Led, type LedStatus } from '../../ui/Led';
import { Segmented } from '../../ui/Segmented';
import { endpointLabel } from '../simulation/FixDialog';
import { reason, StepList, verdictLed } from '../simulation/Steps';
import { AssertionDialog, type AssertionDraft } from './AssertionDialog';

type Mode = 'zones' | 'devices';
/** Element × element stays readable (and O(n²) cheap) up to this many elements. */
const MAX_ELEMENTS = 12;
const INFRA = new Set([
  'internet',
  'router',
  'firewall',
  'switch',
  'access-point',
  'modem',
  'patch-panel',
  'ups',
]);

const cellLed: Record<MatrixCell['status'], LedStatus> = {
  full: 'ok',
  partial: 'warning',
  none: 'error',
  unknown: 'off',
};

const NEW_ASSERTION: AssertionDraft = {
  source: { type: 'any' },
  destination: { type: 'any' },
  protocol: 'tcp',
  expect: 'blocked',
  enabled: true,
};

/** Devices with an address — the element axis of the device × device matrix. */
function deviceRefs(project: Project): EntityRef[] {
  const addressed = new Set(
    Object.values(project.interfaces)
      .filter((i) => i.addresses.length > 0 && i.owner.type === 'device')
      .map((i) => i.owner.id),
  );
  return Object.values(project.devices)
    .filter((d) => !INFRA.has(d.kind) && addressed.has(d.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_ELEMENTS)
    .map((d) => ({ type: 'device', id: d.id }));
}

function refName(project: Project, ref: EntityRef): string {
  if (ref.type === 'device' || ref.type === 'workload' || ref.type === 'app')
    return endpointLabel(project, { type: ref.type, id: ref.id });
  return '?';
}

/** V-05 Access (docs/05 § 9): zone × zone matrix, exposure from the internet and assertions. */
export function AccessView() {
  const { t } = useTranslation('views');
  const { simulator } = useServices();
  const project = useSession((s) => s.project);
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get('matrix') === 'devices' ? 'devices' : 'zones';
  const [matrix, setMatrix] = useState<AccessMatrix | null>(null);
  const [exposure, setExposure] = useState<Exposure[] | null>(null);
  const [selected, setSelected] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const refs = mode === 'devices' ? deviceRefs(project) : undefined;
    void Promise.all([simulator.matrix(project, refs), simulator.exposure(project)]).then(
      ([m, e]) => {
        if (cancelled) return;
        setMatrix(m);
        setExposure(e);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [project, simulator, mode]);

  // A new axis invalidates the selected cell.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on mode change only
  useEffect(() => setSelected(null), [mode]);

  if (!project) return null;
  const setMode = (next: Mode) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'zones') p.delete('matrix');
        else p.set('matrix', next);
        return p;
      },
      { replace: true },
    );
  const cell = selected && matrix ? matrix.cells[selected[0]]?.[selected[1]] : undefined;

  return (
    <section aria-label={t('access.title')} className="flex min-w-0 flex-1 flex-col bg-app">
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="m-0 text-title font-semibold">{t('access.title')}</h2>
        <span className="grow" />
        <Segmented
          label={t('access.mode')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'zones', label: t('access.modes.zones') },
            { value: 'devices', label: t('access.modes.devices') },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex max-w-240 flex-col gap-6">
          <section className="flex flex-col gap-3" aria-label={t('access.matrix')}>
            <Heading>{t('access.matrix')}</Heading>
            {!matrix ? (
              <p className="m-0 text-text-secondary">{t('access.computing')}</p>
            ) : matrix.axis.length < 2 ? (
              <p className="m-0 text-text-secondary">
                {mode === 'zones' ? t('access.noZones') : t('access.noDevices')}
              </p>
            ) : (
              <MatrixTable matrix={matrix} selected={selected} onSelect={setSelected} />
            )}
            <p className="m-0 text-body-sm text-text-muted">{t('access.legend')}</p>
            {cell?.example && selected && matrix ? (
              <CellDetail
                project={project}
                from={matrix.axis[selected[0]]?.label ?? ''}
                to={matrix.axis[selected[1]]?.label ?? ''}
                cell={cell}
                example={cell.example}
              />
            ) : null}
          </section>
          <ExposureList project={project} exposure={exposure} />
          <AssertionList project={project} />
        </div>
      </div>
    </section>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
      {children}
    </h3>
  );
}

function MatrixTable({
  matrix,
  selected,
  onSelect,
}: {
  matrix: AccessMatrix;
  selected: [number, number] | null;
  onSelect: (cell: [number, number]) => void;
}) {
  const { t } = useTranslation('views');
  return (
    <div className="overflow-auto rounded-md border border-border-subtle bg-panel">
      <table className="border-collapse text-left">
        <thead>
          <tr>
            <th className="px-3 py-2 font-mono text-label text-text-muted uppercase">
              {t('access.fromTo')}
            </th>
            {matrix.axis.map((a) => (
              <th
                key={a.key}
                scope="col"
                className="px-3 py-2 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase"
              >
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.axis.map((row, i) => (
            <tr key={row.key} className="border-t border-border-subtle">
              <th scope="row" className="px-3 py-2 text-body font-medium">
                {row.label}
              </th>
              {matrix.axis.map((col, j) => {
                const c = matrix.cells[i]?.[j];
                if (!c) return <td key={col.key} />;
                const label = t('access.cell', {
                  from: row.label,
                  to: col.label,
                  status: c.status,
                  allowed: c.allowed,
                });
                const active = selected?.[0] === i && selected[1] === j;
                return (
                  <td key={col.key} className="p-1">
                    {c.status === 'unknown' ? (
                      <span
                        role="img"
                        aria-label={label}
                        title={label}
                        className="flex h-8 items-center justify-center text-text-muted"
                      >
                        —
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={active}
                        title={label}
                        onClick={() => onSelect([i, j])}
                        className={`flex h-8 w-full min-w-16 items-center justify-center gap-1.5 rounded-sm font-mono text-data ${active ? 'bg-accent-subtle text-text-primary' : 'text-text-secondary hover:bg-tile-header'}`}
                      >
                        <Led status={cellLed[c.status]} size={7} />
                        {`${c.allowed}/5`}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellDetail({
  project,
  from,
  to,
  cell,
  example,
}: {
  project: Project;
  from: string;
  to: string;
  cell: MatrixCell;
  example: ReachabilityResult;
}) {
  const { t } = useTranslation('views');
  const { t: ts } = useTranslation('simulation');
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border-subtle bg-panel p-3"
      aria-live="polite"
    >
      <span className="font-medium">
        {t('access.detail', { from, to, status: cell.status, allowed: cell.allowed })}
      </span>
      <span className="text-body-sm text-text-secondary">{reason(ts, example)}</span>
      <StepList project={project} result={example} />
    </div>
  );
}

function ExposureList({ project, exposure }: { project: Project; exposure: Exposure[] | null }) {
  const { t } = useTranslation('views');
  const { t: ts } = useTranslation('simulation');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3" aria-label={t('access.exposure')}>
      <Heading>{t('access.exposure')}</Heading>
      {!exposure ? null : exposure.length === 0 ? (
        <p className="m-0 text-text-secondary">{t('access.noExposure')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col rounded-md border border-border-subtle bg-panel p-0">
          {exposure.map((e) => {
            const target = e.target ? refName(project, e.target) : '—';
            const expanded = open === e.ruleId;
            return (
              <li key={e.ruleId} className="border-b border-border-subtle last:border-b-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : e.ruleId)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-tile-header"
                >
                  <Led status={verdictLed[e.result.verdict]} size={7} />
                  <span className="w-28 font-mono text-data">{`${e.protocol}/${e.externalPort}`}</span>
                  <span className="flex-1">
                    {t('access.forward', {
                      router: project.devices[e.routerId]?.name ?? '?',
                      target,
                    })}
                  </span>
                  <span className="text-body-sm text-text-secondary">
                    {ts(`verdict.${e.result.verdict}`)}
                  </span>
                </button>
                {expanded ? (
                  <div className="flex flex-col gap-2 px-3 pb-3">
                    <span className="text-body-sm text-text-secondary">{reason(ts, e.result)}</span>
                    <StepList project={project} result={e.result} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AssertionList({ project }: { project: Project }) {
  const { t } = useTranslation('views');
  const { session } = useServices();
  const results = useResults((s) => s.result?.assertions);
  const byId = useMemo(() => new Map((results ?? []).map((r) => [r.assertionId, r])), [results]);
  const [dialog, setDialog] = useState<{ initial: AssertionDraft; editId?: string } | null>(null);
  const assertions = Object.values(project.assertions);
  const failed = assertions.filter((a) => a.enabled && byId.get(a.id)?.passed === false).length;

  const service = (a: Assertion) =>
    a.protocol === 'icmp' || a.protocol === 'any' || a.port === undefined
      ? a.protocol
      : `${a.protocol}/${a.port}`;

  return (
    <section className="flex flex-col gap-3" aria-label={t('access.assertions')}>
      <div className="flex items-center gap-3">
        <Heading>{t('access.assertions')}</Heading>
        <span className="font-mono text-data-sm text-text-muted">
          {t('access.assertionSummary', { total: assertions.length, failed })}
        </span>
        <span className="grow" />
        <Button size="sm" onClick={() => setDialog({ initial: NEW_ASSERTION })}>
          <Plus size={14} aria-hidden="true" />
          {t('access.addAssertion')}
        </Button>
      </div>
      {assertions.length === 0 ? (
        <p className="m-0 text-text-secondary">{t('access.noAssertions')}</p>
      ) : (
        <table className="w-full border-collapse rounded-md border border-border-subtle bg-panel text-left">
          <thead>
            <tr className="font-mono text-label tracking-[0.08em] text-text-secondary uppercase">
              <th className="px-3 py-2 font-semibold">{t('access.columns.enabled')}</th>
              <th className="px-3 py-2 font-semibold">{t('access.columns.name')}</th>
              <th className="px-3 py-2 font-semibold">{t('access.columns.path')}</th>
              <th className="px-3 py-2 font-semibold">{t('access.columns.expect')}</th>
              <th className="px-3 py-2 font-semibold">{t('access.columns.result')}</th>
              <th className="px-3 py-2">
                <span className="sr-only">{t('access.columns.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {assertions.map((a) => {
              const r = byId.get(a.id);
              const name = a.name || t('access.unnamed');
              return (
                <tr key={a.id} className="border-t border-border-subtle">
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-accent"
                      aria-label={t('access.toggle', { name })}
                      checked={a.enabled}
                      onChange={(e) =>
                        session.dispatch(updateAssertion, {
                          id: a.id,
                          changes: { enabled: e.target.checked },
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-1.5">{name}</td>
                  <td className="px-3 py-1.5 font-mono text-data text-text-secondary">
                    {`${endpointLabel(project, a.source)} → ${endpointLabel(project, a.destination)} · ${service(a)}`}
                  </td>
                  <td className="px-3 py-1.5 text-body-sm">{t(`access.expect.${a.expect}`)}</td>
                  <td className="px-3 py-1.5 text-body-sm">
                    {!a.enabled ? (
                      <span className="flex items-center gap-1.5 text-text-muted">
                        <Led status="off" size={7} />
                        {t('access.result.disabled')}
                      </span>
                    ) : !r ? (
                      <span className="text-text-muted">…</span>
                    ) : r.passed ? (
                      <span className="flex items-center gap-1.5 text-ok-text">
                        <Led status="ok" size={7} />
                        {t('access.result.passed')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-error-text">
                        <Led status="error" size={7} />
                        {t('access.result.failed', { actual: r.actual })}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('access.edit', { name })}
                        onClick={() => setDialog({ initial: a, editId: a.id })}
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('access.delete', { name })}
                        onClick={() => session.dispatch(deleteAssertion, { id: a.id })}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <AssertionDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        initial={dialog?.initial ?? NEW_ASSERTION}
        {...(dialog?.editId ? { editId: dialog.editId } : {})}
      />
    </section>
  );
}
