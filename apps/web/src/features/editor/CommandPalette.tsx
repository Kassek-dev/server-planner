import * as RadixDialog from '@radix-ui/react-dialog';
import { labelCables, type Project } from '@server-planner/model';
import { Search } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useServices } from '../../app/services';
import { useSelection } from '../canvas/selection';
import { useDrawer } from '../drawers/useDrawer';
import { useExportDialog } from '../export/store';

/** CAN-09 command palette (Ctrl+K): find an element or run an action by name. */

interface Entry {
  id: string;
  label: string;
  group: 'elements' | 'views' | 'actions';
  hint: string;
  run(): void;
}

const MAX_RESULTS = 12;

export function CommandPalette({ project }: { project: Project }) {
  const { t } = useTranslation('editor');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { projectId = '' } = useParams();
  const [, setParams] = useSearchParams();
  const { open: openDrawer } = useDrawer();
  const { session } = useServices();
  const listId = useId();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const view = (path: string) => () => navigate(`/p/${projectId}${path ? `/${path}` : ''}`);
    const toTopology = () => navigate(`/p/${projectId}`);
    const element = (id: string, label: string, hint: string, select: () => void): Entry => ({
      id,
      label,
      group: 'elements',
      hint,
      run: () => {
        toTopology();
        select();
      },
    });
    const sel = useSelection.getState();
    const setPanel = (panel: string) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('panel', panel);
        return next;
      });
    return [
      ...Object.values(project.devices)
        .filter((d) => d.kind !== 'internet')
        .map((d) => element(d.id, d.name, t('palette.kinds.device'), () => sel.set([d.id]))),
      ...Object.values(project.locations).map((l) =>
        element(l.id, l.name, t('palette.kinds.location'), () => sel.set([l.id])),
      ),
      ...Object.values(project.workloads).map((w) =>
        element(w.id, w.name, t('palette.kinds.workload'), () =>
          sel.setDetail({ type: 'workload', id: w.id }),
        ),
      ),
      ...Object.values(project.apps).map((a) =>
        element(a.id, a.name, t('palette.kinds.app'), () =>
          sel.setDetail({ type: 'app', id: a.id }),
        ),
      ),
      ...(['topology', 'dashboard', 'inventory', 'ip', 'access'] as const).map(
        (v): Entry => ({
          id: `view:${v}`,
          label: t(`views.${v}`),
          group: 'views',
          hint: t('palette.kinds.view'),
          run: view(v === 'topology' ? '' : v),
        }),
      ),
      ...(
        [
          ['simulate', () => setPanel('sim')],
          ['issues', () => setPanel('issues')],
          ['export', () => useExportDialog.getState().setOpen(true)],
          ['vlans', () => openDrawer({ kind: 'vlans' })],
          ['tags', () => openDrawer({ kind: 'tags' })],
          ['settings', () => openDrawer({ kind: 'settings' })],
          ['labelCables', () => session.dispatch(labelCables, {})],
        ] as const
      ).map(
        ([key, run]): Entry => ({
          id: `action:${key}`,
          label: t(`palette.actions.${key}`),
          group: 'actions',
          hint: t('palette.kinds.action'),
          run,
        }),
      ),
    ];
  }, [project, navigate, projectId, setParams, openDrawer, session, t]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? entries
          .filter((e) => e.label.toLowerCase().includes(q))
          .sort(
            (a, b) =>
              Number(!a.label.toLowerCase().startsWith(q)) -
                Number(!b.label.toLowerCase().startsWith(q)) || a.label.localeCompare(b.label),
          )
      : entries.filter((e) => e.group !== 'elements');
    return list.slice(0, MAX_RESULTS);
  }, [entries, query]);

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    entry.run();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[active]);
    }
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 bg-app/70" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed top-24 left-1/2 flex w-140 max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-border-default bg-raised text-text-primary shadow-overlay"
        >
          <RadixDialog.Title className="sr-only">{t('palette.title')}</RadixDialog.Title>
          <div className="flex items-center gap-2 border-b border-border-subtle px-3">
            <Search size={16} aria-hidden="true" className="text-text-muted" />
            <input
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
              aria-label={t('palette.search')}
              placeholder={t('palette.placeholder')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-12 flex-1 bg-transparent text-body outline-none"
            />
          </div>
          {results.length === 0 ? (
            <p className="m-0 px-4 py-3 text-text-secondary">{t('palette.empty')}</p>
          ) : null}
          <div
            id={listId}
            role="listbox"
            aria-label={t('palette.results')}
            className="max-h-90 overflow-auto p-1"
          >
            {results.map((entry, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard is handled by the combobox input
              <div
                key={entry.id}
                id={`${listId}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(entry)}
                className={`flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 ${i === active ? 'bg-accent-subtle' : ''}`}
              >
                <span className="flex-1 truncate">{entry.label}</span>
                <span className="text-body-sm text-text-muted">{entry.hint}</span>
              </div>
            ))}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
