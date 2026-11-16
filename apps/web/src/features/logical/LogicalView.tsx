import { Globe, Router, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useSession } from '../../app/services';
import { Button } from '../../ui/Button';
import { colorOf } from '../canvas/graph';
import { useSelection } from '../canvas/selection';
import { type LogicalSubnet, logicalMap } from './logicalMap';

const PAD = 16;
const COL_W = 232;
const COL_GAP = 40;
const CARD_H = 76;
const CARD_GAP = 12;
const HEADER_H = 32;
const NODE_H = 56;
const ROUTER_W = 200;
const ROW_GAP = 56;

/**
 * V-08 Logical L3 (VIEW-06): the Internet, the routers and each zone with its subnets, wired by
 * addressing. A router opens in the inspector, a subnet opens VLANs & subnets.
 */
export function LogicalView() {
  const { t } = useTranslation('views');
  const project = useSession((s) => s.project);
  const [, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { projectId = '' } = useParams();
  if (!project) return null;
  const map = logicalMap(project);
  const columns = Math.max(1, map.zones.length);
  const width = PAD * 2 + columns * COL_W + (columns - 1) * COL_GAP;
  const hasWan = map.routers.some((r) => r.wan);
  const internetY = PAD;
  const routerY = hasWan ? internetY + NODE_H + ROW_GAP : PAD;
  const routersW = map.routers.length * ROUTER_W + Math.max(0, map.routers.length - 1) * COL_GAP;
  const routerX = (i: number) => (width - routersW) / 2 + i * (ROUTER_W + COL_GAP);
  const zonesY = routerY + (map.routers.length > 0 ? NODE_H + ROW_GAP + map.routers.length * 8 : 0);
  const colX = (i: number) => PAD + i * (COL_W + COL_GAP);
  const cardY = (j: number) => zonesY + HEADER_H + j * (CARD_H + CARD_GAP);
  const tallest = Math.max(1, ...map.zones.map((z) => z.subnets.length));
  const height = cardY(tallest) + PAD;
  const where = new Map<string, { x: number; y: number }>();
  map.zones.forEach((z, i) => {
    z.subnets.forEach((s, j) => {
      where.set(s.id, { x: colX(i), y: cardY(j) + CARD_H / 2 });
    });
  });
  const openSubnets = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('panel', 'vlans');
      return next;
    });

  const empty = map.zones.length === 0 && map.routers.length === 0;
  return (
    <section aria-label={t('logical.title')} className="flex min-w-0 flex-1 flex-col bg-app">
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="m-0 text-title font-semibold">{t('logical.title')}</h2>
        <span className="grow" />
        <Button
          icon={<ShieldCheck size={14} aria-hidden="true" />}
          onClick={() => navigate(`/p/${projectId}/access`)}
        >
          {t('logical.access')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-canvas">
        {empty ? (
          <p className="m-0 p-6 text-text-secondary">{t('logical.empty')}</p>
        ) : (
          <div className="relative m-4" style={{ width, height }}>
            <svg
              width={width}
              height={height}
              aria-hidden="true"
              className="absolute inset-0"
              fill="none"
              strokeWidth={1.5}
            >
              {map.routers.map((r, i) => {
                const x = routerX(i) + ROUTER_W / 2;
                const bottom = routerY + NODE_H;
                const bus = bottom + ROW_GAP / 2 + i * 8;
                return (
                  <g key={r.id} stroke="var(--sp-border-strong)">
                    {r.wan && hasWan ? (
                      <path
                        d={`M${width / 2},${internetY + NODE_H} V${(internetY + NODE_H + routerY) / 2} H${x} V${routerY}`}
                        stroke="var(--sp-port-wan)"
                      />
                    ) : null}
                    {r.subnets.map((id) => {
                      const target = where.get(id);
                      if (!target) return null;
                      return (
                        <path
                          key={id}
                          d={`M${x},${bottom} V${bus} H${target.x - 12} V${target.y} H${target.x}`}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>
            <ul aria-label={t('logical.map')} className="m-0 list-none p-0">
              {hasWan ? (
                <li
                  className="absolute flex items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-tile font-mono text-data text-text-secondary uppercase"
                  style={{ left: width / 2 - 80, top: internetY, width: 160, height: NODE_H }}
                >
                  <Globe size={16} aria-hidden="true" />
                  {t('logical.internet')}
                </li>
              ) : null}
              {map.routers.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => useSelection.getState().set([r.id])}
                    aria-label={t('logical.routerLabel', {
                      name: r.name,
                      count: r.subnets.length,
                    })}
                    className="absolute flex flex-col justify-center gap-0.5 rounded-md border border-border-default bg-tile px-3 text-left hover:border-border-strong"
                    style={{ left: routerX(i), top: routerY, width: ROUTER_W, height: NODE_H }}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <Router size={14} aria-hidden="true" />
                      {r.name}
                    </span>
                    <span className="font-mono text-data-sm text-text-secondary">
                      {r.policy
                        ? t('logical.firewall', { policy: r.policy, rules: r.rules })
                        : t('logical.noFirewall')}
                    </span>
                  </button>
                </li>
              ))}
              {map.zones.map((z, i) => (
                <li key={z.id || 'none'}>
                  <div
                    className="absolute flex items-center gap-2 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase"
                    style={{ left: colX(i), top: zonesY, width: COL_W, height: HEADER_H - 8 }}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block size-2.5 rounded-full bg-border-strong"
                      style={z.color ? { background: colorOf(z.color as never) } : undefined}
                    />
                    {z.id ? z.name : t('logical.noZone')}
                    {z.intraZone === 'deny' ? (
                      <span className="font-normal normal-case">{t('logical.isolated')}</span>
                    ) : null}
                  </div>
                  <ul
                    aria-label={z.id ? z.name : t('logical.noZone')}
                    className="m-0 list-none p-0"
                  >
                    {z.subnets.map((s, j) => (
                      <li key={s.id}>
                        <SubnetCard
                          subnet={s}
                          style={{ left: colX(i), top: cardY(j), width: COL_W, height: CARD_H }}
                          onOpen={openSubnets}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function SubnetCard({
  subnet: s,
  style,
  onOpen,
}: {
  subnet: LogicalSubnet;
  style: React.CSSProperties;
  onOpen: () => void;
}) {
  const { t } = useTranslation('views');
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('logical.subnetLabel', { cidr: s.cidr, hosts: s.hosts })}
      className="absolute flex flex-col justify-center gap-0.5 overflow-hidden rounded-md border border-border-default bg-tile px-3 text-left hover:border-border-strong"
      style={style}
    >
      <span className="truncate font-mono text-data font-semibold text-text-primary">{s.cidr}</span>
      <span className="truncate text-body-sm text-text-secondary">
        {[s.name, s.vlan ? t('logical.vlan', { vlan: s.vlan }) : t('logical.untagged')]
          .filter(Boolean)
          .join(' · ')}
      </span>
      <span className="truncate font-mono text-data-sm text-text-muted">
        {[
          s.gateway ? t('logical.gateway', { gateway: s.gateway }) : '',
          t('logical.hosts', { count: s.hosts }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </button>
  );
}
