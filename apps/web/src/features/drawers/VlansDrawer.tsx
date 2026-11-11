import {
  addSubnet,
  addVlan,
  addZone,
  deleteSubnet,
  deleteVlan,
  deleteZone,
  isValidCidr,
  isValidIp,
  PALETTE_KEYS,
  type PaletteKey,
  type Project,
  type Subnet,
  updateSubnet,
  updateVlan,
  updateZone,
} from '@server-planner/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../../ui/Checkbox';
import { Select } from '../../ui/Select';
import { Tabs } from '../../ui/Tabs';
import { colorOf } from '../canvas/graph';
import {
  AddButton,
  Card,
  CommitField,
  Grid,
  intValidator,
  RemoveButton,
  Section,
  useCommand,
} from '../inspector/parts';

type Tab = 'vlans' | 'subnets' | 'zones';

/** S-01 VLANs, subnets and zones (NET-01, NET-03, NET-06). */
export function VlansDrawer({ project }: { project: Project }) {
  const { t } = useTranslation('drawers');
  const [tab, setTab] = useState<Tab>('vlans');
  return (
    <Tabs
      label={t('vlans.title')}
      value={tab}
      onChange={setTab}
      tabs={[
        { value: 'vlans', label: t('vlans.tabs.vlans') },
        { value: 'subnets', label: t('vlans.tabs.subnets') },
        { value: 'zones', label: t('vlans.tabs.zones') },
      ]}
    >
      {tab === 'vlans' ? <VlanList project={project} /> : null}
      {tab === 'subnets' ? <SubnetList project={project} /> : null}
      {tab === 'zones' ? <ZoneList project={project} /> : null}
    </Tabs>
  );
}

function Swatch({ color }: { color: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-1.5 w-4.5 shrink-0 rounded-xs"
      style={{ background: color }}
    />
  );
}

function nextPaletteKey(used: string[]): PaletteKey {
  return (
    PALETTE_KEYS.find((k) => !used.includes(k)) ??
    PALETTE_KEYS[used.length % PALETTE_KEYS.length] ??
    'sky'
  );
}

function VlanList({ project }: { project: Project }) {
  const { t } = useTranslation('drawers');
  const run = useCommand();
  const vlans = Object.values(project.vlans).sort((a, b) => a.vid - b.vid);
  const add = () => {
    const used = new Set(vlans.map((v) => v.vid));
    let vid = 10;
    while (used.has(vid)) vid += 10;
    run(addVlan, {
      vlan: { vid, name: `VLAN ${vid}`, color: nextPaletteKey(vlans.map((v) => v.color)) },
    });
  };
  const subnetCount = (id: string) =>
    Object.values(project.subnets).filter((s) => s.vlanId === id).length;
  return (
    <Section
      title={t('vlans.vlanCount', { count: vlans.length })}
      action={<AddButton label={t('vlans.addVlan')} onClick={add} />}
    >
      {vlans.map((vlan) => (
        <fieldset
          key={vlan.id}
          className="m-0 grid grid-cols-[150px_90px_1fr_80px_auto] items-end gap-2.5 border-0 p-0"
        >
          <legend className="sr-only">{`VLAN ${vlan.vid}`}</legend>
          <div className="flex items-end gap-2">
            <Swatch color={colorOf(vlan.color)} />
            <Select
              label={t('vlans.color')}
              mono
              value={PALETTE_KEYS.includes(vlan.color as PaletteKey) ? vlan.color : ''}
              options={[
                ...(PALETTE_KEYS.includes(vlan.color as PaletteKey)
                  ? []
                  : [{ value: '', label: vlan.color }]),
                ...PALETTE_KEYS.map((k) => ({ value: k, label: k })),
              ]}
              onChange={(e) =>
                e.target.value &&
                run(updateVlan, { id: vlan.id, changes: { color: e.target.value as PaletteKey } })
              }
            />
          </div>
          <CommitField
            label={t('vlans.vid')}
            mono
            value={String(vlan.vid)}
            validate={intValidator(1, 4094, t('errors.vid'))}
            onCommit={(v) => run(updateVlan, { id: vlan.id, changes: { vid: Number(v) } })}
          />
          <CommitField
            label={t('vlans.name')}
            value={vlan.name}
            onCommit={(name) => name && run(updateVlan, { id: vlan.id, changes: { name } })}
          />
          <span className="pb-2 font-mono text-data text-text-secondary">
            {t('vlans.subnets', { count: subnetCount(vlan.id) })}
          </span>
          <RemoveButton
            label={t('actions.remove')}
            onClick={() => run(deleteVlan, { id: vlan.id })}
          />
        </fieldset>
      ))}
      {vlans.length === 0 ? <p className="m-0 text-text-secondary">{t('vlans.empty')}</p> : null}
    </Section>
  );
}

function SubnetList({ project }: { project: Project }) {
  const { t } = useTranslation('drawers');
  const run = useCommand();
  const subnets = Object.values(project.subnets).sort((a, b) =>
    a.cidr.localeCompare(b.cidr, 'en', { numeric: true }),
  );
  const vlans = Object.values(project.vlans).sort((a, b) => a.vid - b.vid);
  const zones = Object.values(project.zones);
  const dnsApps = Object.values(project.apps).filter(
    (a) => a.role === 'dns' || a.listeners.some((l) => l.port === 53),
  );
  const add = () => {
    const used = new Set(subnets.map((s) => s.cidr));
    let n = 1;
    while (used.has(`192.168.${n}.0/24`)) n += 1;
    const vlan = vlans.find((v) => !subnets.some((s) => s.vlanId === v.id));
    const third = vlan && !used.has(`192.168.${vlan.vid}.0/24`) && vlan.vid <= 255 ? vlan.vid : n;
    run(addSubnet, {
      subnet: {
        cidr: `192.168.${third}.0/24`,
        gateway: `192.168.${third}.1`,
        ...(vlan ? { vlanId: vlan.id } : {}),
      },
    });
  };
  const ipCheck = (v: string) => (v === '' || isValidIp(v) ? null : t('errors.ip'));

  return (
    <Section
      title={t('vlans.subnetCount', { count: subnets.length })}
      action={<AddButton label={t('vlans.addSubnet')} onClick={add} />}
    >
      {subnets.map((subnet) => {
        const update = (changes: Partial<Omit<Subnet, 'id'>>) =>
          run(updateSubnet, { id: subnet.id, changes });
        const dns = subnet.dns?.servers[0];
        const dnsValue = dns ? (dns.type === 'app' ? `app:${dns.id}` : 'ip') : '';
        return (
          <Card key={subnet.id} label={subnet.cidr}>
            <div className="flex items-end gap-2">
              <Grid cols={3}>
                <CommitField
                  label={t('vlans.cidr')}
                  mono
                  value={subnet.cidr}
                  validate={(v) => (isValidCidr(v) ? null : t('errors.cidr'))}
                  onCommit={(cidr) => update({ cidr: cidr.trim() })}
                />
                <Select
                  label={t('vlans.vlan')}
                  mono
                  value={subnet.vlanId ?? ''}
                  options={[
                    { value: '', label: '—' },
                    ...vlans.map((v) => ({ value: v.id, label: `${v.vid} · ${v.name}` })),
                  ]}
                  onChange={(e) => update({ vlanId: e.target.value || undefined })}
                />
                <Select
                  label={t('vlans.zone')}
                  value={subnet.zoneId ?? ''}
                  options={[
                    { value: '', label: '—' },
                    ...zones.map((z) => ({ value: z.id, label: z.name })),
                  ]}
                  onChange={(e) => update({ zoneId: e.target.value || undefined })}
                />
              </Grid>
              <RemoveButton
                label={t('actions.remove')}
                onClick={() => run(deleteSubnet, { id: subnet.id })}
              />
            </div>
            <Grid cols={3}>
              <CommitField
                label={t('vlans.gateway')}
                mono
                value={subnet.gateway ?? ''}
                validate={ipCheck}
                onCommit={(v) => update({ gateway: v.trim() || undefined })}
              />
              <Select
                label={t('vlans.dns')}
                value={dnsValue}
                options={[
                  { value: '', label: '—' },
                  ...dnsApps.map((a) => ({ value: `app:${a.id}`, label: a.name })),
                  { value: 'ip', label: t('vlans.dnsIp') },
                ]}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) update({ dns: undefined });
                  else if (v === 'ip')
                    update({ dns: { ...subnet.dns, servers: [{ type: 'ip', value: '1.1.1.1' }] } });
                  else
                    update({ dns: { ...subnet.dns, servers: [{ type: 'app', id: v.slice(4) }] } });
                }}
              />
              {dns?.type === 'ip' ? (
                <CommitField
                  label={t('vlans.dnsServer')}
                  mono
                  value={dns.value}
                  validate={(v) => (isValidIp(v) ? null : t('errors.ip'))}
                  onCommit={(v) =>
                    update({ dns: { ...subnet.dns, servers: [{ type: 'ip', value: v.trim() }] } })
                  }
                />
              ) : (
                <CommitField
                  label={t('vlans.domain')}
                  mono
                  value={subnet.dns?.domain ?? ''}
                  onCommit={(v) =>
                    update({
                      dns: { servers: subnet.dns?.servers ?? [], ...(v ? { domain: v } : {}) },
                    })
                  }
                />
              )}
            </Grid>
            <Checkbox
              label={t('vlans.dhcp')}
              checked={!!subnet.dhcp?.enabled}
              onChange={(e) => {
                const base =
                  subnet.cidr.split('/')[0]?.split('.').slice(0, 3).join('.') ?? '192.168.0';
                update({
                  dhcp: e.target.checked
                    ? {
                        enabled: true,
                        rangeStart: subnet.dhcp?.rangeStart ?? `${base}.100`,
                        rangeEnd: subnet.dhcp?.rangeEnd ?? `${base}.199`,
                      }
                    : undefined,
                });
              }}
            />
            {subnet.dhcp?.enabled ? (
              <Grid>
                <CommitField
                  label={t('vlans.rangeStart')}
                  mono
                  value={subnet.dhcp.rangeStart}
                  validate={(v) => (isValidIp(v) ? null : t('errors.ip'))}
                  onCommit={(v) =>
                    subnet.dhcp && update({ dhcp: { ...subnet.dhcp, rangeStart: v.trim() } })
                  }
                />
                <CommitField
                  label={t('vlans.rangeEnd')}
                  mono
                  value={subnet.dhcp.rangeEnd}
                  validate={(v) => (isValidIp(v) ? null : t('errors.ip'))}
                  onCommit={(v) =>
                    subnet.dhcp && update({ dhcp: { ...subnet.dhcp, rangeEnd: v.trim() } })
                  }
                />
              </Grid>
            ) : null}
          </Card>
        );
      })}
      {subnets.length === 0 ? (
        <p className="m-0 text-text-secondary">{t('vlans.noSubnets')}</p>
      ) : null}
    </Section>
  );
}

function ZoneList({ project }: { project: Project }) {
  const { t } = useTranslation('drawers');
  const run = useCommand();
  const zones = Object.values(project.zones);
  return (
    <Section
      title={t('vlans.zoneCount', { count: zones.length })}
      action={
        <AddButton
          label={t('vlans.addZone')}
          onClick={() =>
            run(addZone, {
              zone: {
                name: `Zone ${zones.length + 1}`,
                kind: 'internal',
                color: nextPaletteKey(zones.map((z) => z.color)),
                intraZone: 'allow',
              },
            })
          }
        />
      }
    >
      <p className="m-0 text-body-sm text-text-muted">{t('vlans.zonesHint')}</p>
      {zones.map((zone) => (
        <fieldset
          key={zone.id}
          className="m-0 grid grid-cols-[1fr_130px_130px_130px_auto] items-end gap-2.5 border-0 p-0"
        >
          <legend className="sr-only">{zone.name}</legend>
          <CommitField
            label={t('vlans.name')}
            value={zone.name}
            onCommit={(name) => name && run(updateZone, { id: zone.id, changes: { name } })}
          />
          <Select
            label={t('vlans.zoneKind')}
            value={zone.kind}
            options={[
              { value: 'internal', label: t('vlans.internal') },
              { value: 'wan', label: 'WAN' },
            ]}
            onChange={(e) =>
              run(updateZone, {
                id: zone.id,
                changes: { kind: e.target.value as 'wan' | 'internal' },
              })
            }
          />
          <Select
            label={t('vlans.color')}
            mono
            value={PALETTE_KEYS.includes(zone.color as PaletteKey) ? zone.color : ''}
            options={PALETTE_KEYS.map((k) => ({ value: k, label: k }))}
            onChange={(e) =>
              run(updateZone, { id: zone.id, changes: { color: e.target.value as PaletteKey } })
            }
          />
          <Select
            label={t('vlans.intraZone')}
            value={zone.intraZone}
            options={[
              { value: 'allow', label: t('vlans.allow') },
              { value: 'deny', label: t('vlans.deny') },
            ]}
            onChange={(e) =>
              run(updateZone, {
                id: zone.id,
                changes: { intraZone: e.target.value as 'allow' | 'deny' },
              })
            }
          />
          <RemoveButton
            label={t('actions.remove')}
            onClick={() => run(deleteZone, { id: zone.id })}
          />
        </fieldset>
      ))}
    </Section>
  );
}
