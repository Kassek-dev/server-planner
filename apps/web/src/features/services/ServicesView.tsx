import { Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useSession } from '../../app/services';
import { Button } from '../../ui/Button';
import { useSelection } from '../canvas/selection';
import { type ServiceEdge, type ServiceNode, servicesMap } from './servicesMap';

const W = 208;
const H = 64;
const GAP_X = 88;
const GAP_Y = 16;
const PAD = 16;

const x = (column: number) => PAD + column * (W + GAP_X);
const y = (row: number) => PAD + row * (H + GAP_Y);

const EDGE_STYLE: Record<ServiceEdge['kind'], { stroke: string; dash?: string }> = {
  route: { stroke: 'var(--sp-accent)' },
  record: { stroke: 'var(--sp-text-muted)', dash: '4 4' },
  dependency: { stroke: 'var(--sp-border-strong)' },
  missing: { stroke: 'var(--sp-status-error)', dash: '4 4' },
};

/**
 * V-07 Services map (VIEW-07): host names → reverse proxies → apps → their dependencies. An app
 * opens in the inspector; a host name opens Proxy & DNS (S-06).
 */
export function ServicesView() {
  const { t } = useTranslation('views');
  const project = useSession((s) => s.project);
  const detail = useSelection((s) => s.detail);
  const [, setParams] = useSearchParams();
  if (!project) return null;
  const map = servicesMap(project);
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const width = PAD * 2 + Math.max(1, map.columns) * W + Math.max(0, map.columns - 1) * GAP_X;
  const height = PAD * 2 + Math.max(1, map.rows) * (H + GAP_Y) - GAP_Y;
  const openDrawer = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('panel', 'services');
      return next;
    });

  const label = (n: ServiceNode) =>
    n.kind === 'app'
      ? t('services.appNode', { name: n.name, host: n.host.join(' · ') })
      : n.kind === 'name'
        ? t('services.nameNode', { name: n.name })
        : t('services.missingNode', { capability: n.capability });

  return (
    <section aria-label={t('services.title')} className="flex min-w-0 flex-1 flex-col bg-app">
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="m-0 text-title font-semibold">{t('services.title')}</h2>
        <span className="grow" />
        <Button icon={<Network size={14} aria-hidden="true" />} onClick={openDrawer}>
          {t('services.edit')}
        </Button>
      </div>
      {map.nodes.length > 0 ? (
        <ul className="m-0 flex flex-wrap gap-4 border-b border-border-subtle px-4 py-2 text-body-sm text-text-secondary">
          {(['route', 'record', 'dependency', 'missing'] as const).map((kind) => (
            <li key={kind} className="flex items-center gap-1.5">
              <svg width={24} height={8} aria-hidden="true">
                <line
                  x1={0}
                  y1={4}
                  x2={24}
                  y2={4}
                  stroke={EDGE_STYLE[kind].stroke}
                  strokeWidth={2}
                  strokeDasharray={EDGE_STYLE[kind].dash}
                />
              </svg>
              {t(`services.legend.${kind}`)}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto bg-canvas">
        {map.nodes.length === 0 ? (
          <p className="m-0 p-6 text-text-secondary">{t('services.empty')}</p>
        ) : (
          <div className="relative m-4" style={{ width, height }}>
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              aria-hidden="true"
              className="absolute inset-0"
            >
              <defs>
                <marker
                  id="sp-svc-arrow"
                  viewBox="0 0 8 8"
                  refX={8}
                  refY={4}
                  markerWidth={8}
                  markerHeight={8}
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 z" fill="var(--sp-text-muted)" />
                </marker>
              </defs>
              {map.edges.map((e) => {
                const a = byId.get(e.from);
                const b = byId.get(e.to);
                if (!a || !b) return null;
                const x1 = x(a.column) + W;
                const y1 = y(a.row) + H / 2;
                const x2 = x(b.column);
                const y2 = y(b.row) + H / 2;
                const mid = (x1 + x2) / 2;
                const style = EDGE_STYLE[e.kind];
                return (
                  <g key={`${e.from}>${e.to}:${e.kind}`}>
                    <path
                      d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                      fill="none"
                      stroke={style.stroke}
                      strokeWidth={1.5}
                      strokeDasharray={style.dash}
                      markerEnd="url(#sp-svc-arrow)"
                    />
                    {e.label ? (
                      <text
                        x={mid}
                        y={(y1 + y2) / 2 - 4}
                        textAnchor="middle"
                        fontSize={10}
                        fontFamily="var(--sp-font-mono)"
                        fill="var(--sp-text-secondary)"
                      >
                        {e.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
            <ul aria-label={t('services.map')} className="m-0 list-none p-0">
              {map.nodes.map((n) => {
                const selected = n.kind === 'app' && detail?.type === 'app' && detail.id === n.id;
                const targets = map.edges
                  .filter((e) => e.from === n.id)
                  .map((e) => {
                    const to = byId.get(e.to);
                    return to ? (to.kind === 'missing' ? to.capability : to.name) : '';
                  });
                const lines =
                  n.kind === 'app'
                    ? [n.host.join(' · '), n.ports.join(' ')]
                    : n.kind === 'name'
                      ? [
                          [n.addresses.join(', '), n.host].filter(Boolean).join(' · '),
                          n.dnsAppId
                            ? t('services.answeredBy', {
                                name: project.apps[n.dnsAppId]?.name ?? '?',
                              })
                            : '',
                        ]
                      : [t('services.missing')];
                const body = (
                  <>
                    <span
                      className={`truncate font-semibold text-text-primary ${n.kind === 'name' ? 'font-mono text-data' : 'text-body'}`}
                    >
                      {n.kind === 'missing' ? n.capability : n.name}
                    </span>
                    {lines
                      .filter((line) => line)
                      .map((line) => (
                        <span
                          key={line}
                          className="truncate font-mono text-data-sm text-text-secondary"
                        >
                          {line}
                        </span>
                      ))}
                  </>
                );
                const box = `absolute flex flex-col justify-center gap-0.5 overflow-hidden rounded-md px-2.5 text-left ${
                  n.kind === 'missing'
                    ? 'border border-dashed border-error-border bg-error-bg'
                    : selected
                      ? 'border-2 border-accent bg-tile'
                      : `border bg-tile ${n.kind === 'name' ? 'border-dashed border-border-strong' : 'border-border-default'}`
                }`;
                const place = { left: x(n.column), top: y(n.row), width: W, height: H };
                const description =
                  targets.length > 0 ? t('services.leadsTo', { names: targets.join(', ') }) : '';
                return (
                  <li key={n.id}>
                    {n.kind === 'missing' ? (
                      <div className={box} style={place} title={label(n)}>
                        {body}
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={description ? `${label(n)}. ${description}` : label(n)}
                        aria-pressed={n.kind === 'app' ? selected : undefined}
                        onClick={
                          n.kind === 'app'
                            ? () => useSelection.getState().setDetail({ type: 'app', id: n.id })
                            : openDrawer
                        }
                        className={`${box} cursor-pointer hover:border-border-strong`}
                        style={place}
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
