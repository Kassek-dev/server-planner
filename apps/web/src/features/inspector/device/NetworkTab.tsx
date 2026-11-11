import {
  addInterface,
  addNatRule,
  addRoute,
  COMPUTE_KINDS,
  type Device,
  deleteInterface,
  deleteNatRule,
  deleteRoute,
  type Interface,
  type IpAssignment,
  isValidCidr,
  isValidIp,
  type Project,
  type Ssid,
  subnetForAddress,
  updateDevice,
  updateInterface,
  updateRoute,
} from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../ui/Button';
import { Checkbox } from '../../../ui/Checkbox';
import { Select } from '../../../ui/Select';
import { useDrawer } from '../../drawers/useDrawer';
import {
  AddButton,
  Card,
  CommitField,
  Grid,
  intValidator,
  RemoveButton,
  Row,
  Section,
  useCommand,
} from '../parts';

const SWITCHED_KINDS = new Set(['rj45', 'sfp', 'sfp+', 'sfp28', 'qsfp+', 'bridge', 'wifi-radio']);

/** I-02d Network (docs/05 § 5.2, NET-02…09). */
export function NetworkTab({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const interfaces = Object.values(project.interfaces)
    .filter((i) => i.owner.type === 'device' && i.owner.id === device.id)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0) || a.name.localeCompare(b.name));
  const isRouter = device.kind === 'router' || device.kind === 'firewall';
  const isCompute = COMPUTE_KINDS.includes(device.kind);

  const addVlanInterface = () => {
    const parent = interfaces.find((i) => i.kind === 'rj45' && !i.name.startsWith('wan'));
    const used = new Set(interfaces.map((i) => i.vlanTag).filter((v) => v !== undefined));
    let tag = 10;
    while (used.has(tag)) tag += 10;
    run(addInterface, {
      iface: {
        owner: { type: 'device', id: device.id },
        name: `${parent?.name ?? 'eth0'}.${tag}`,
        kind: 'vlan',
        vlanTag: tag,
        ...(parent ? { parentId: parent.id } : {}),
      },
    });
  };
  const addBridge = () => {
    const n = interfaces.filter((i) => i.kind === 'bridge').length;
    run(addInterface, {
      iface: {
        owner: { type: 'device', id: device.id },
        name: `vmbr${n}`,
        kind: 'bridge',
        switchport: { mode: 'trunk', allowedVlanIds: 'all' },
      },
    });
  };

  return (
    <>
      <Section
        title={t('network.interfaces', { count: interfaces.length })}
        action={
          isRouter ? (
            <AddButton label={t('network.addVlanInterface')} onClick={addVlanInterface} />
          ) : isCompute ? (
            <AddButton label={t('network.addBridge')} onClick={addBridge} />
          ) : undefined
        }
      >
        {interfaces.map((iface) => (
          <InterfaceCard
            key={iface.id}
            project={project}
            device={device}
            iface={iface}
            siblings={interfaces}
          />
        ))}
      </Section>
      {isRouter ? (
        <RoutingSection project={project} device={device} interfaces={interfaces} />
      ) : null}
      {device.wifi ? <WifiSection project={project} device={device} /> : null}
    </>
  );
}

export function InterfaceCard({
  project,
  device,
  iface,
  siblings,
  removable = true,
}: {
  project: Project;
  device?: Device;
  iface: Interface;
  siblings: Interface[];
  removable?: boolean;
}) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const update = (changes: Parameters<typeof updateInterface.run>[1]['changes']) =>
    run(updateInterface, { id: iface.id, changes });
  const vlans = Object.values(project.vlans).sort((a, b) => a.vid - b.vid);
  const vlanOptions = [
    { value: '', label: '—' },
    ...vlans.map((v) => ({ value: v.id, label: `${v.vid} · ${v.name}` })),
  ];
  const sp = iface.switchport;
  const address: IpAssignment | undefined = iface.addresses[0];
  const linked = Object.values(project.links).some((l) => l.a === iface.id || l.b === iface.id);
  const bridges = siblings.filter((s) => s.kind === 'bridge' && s.id !== iface.id);
  const showSwitchport = SWITCHED_KINDS.has(iface.kind) && device?.kind !== 'client';
  const showMembership =
    device &&
    COMPUTE_KINDS.includes(device.kind) &&
    (iface.kind === 'rj45' || iface.kind.startsWith('sfp')) &&
    bridges.length > 0;

  const setAddress = (next: IpAssignment | undefined) => update({ addresses: next ? [next] : [] });

  return (
    <Card label={iface.name}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <CommitField
            label={t('network.name')}
            mono
            value={iface.name}
            onCommit={(name) => name && update({ name })}
          />
        </div>
        <span className="mb-2 rounded-sm bg-text-secondary px-1 font-mono text-badge font-semibold text-app">
          {iface.kind}
        </span>
        {removable ? (
          <RemoveButton
            label={t('actions.remove')}
            onClick={() => run(deleteInterface, { id: iface.id })}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Checkbox
          label={t('network.enabled')}
          checked={iface.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        <span className="text-body-sm text-text-muted">
          {linked ? t('network.connected') : t('network.free')}
        </span>
      </div>

      {showSwitchport ? (
        <Grid>
          <Select
            label={t('network.mode')}
            value={sp?.mode ?? ''}
            options={[
              { value: '', label: t('network.routed') },
              { value: 'access', label: t('network.access') },
              { value: 'trunk', label: t('network.trunk') },
            ]}
            onChange={(e) => {
              const mode = e.target.value;
              update({
                switchport:
                  mode === 'access'
                    ? { mode: 'access' }
                    : mode === 'trunk'
                      ? { mode: 'trunk', allowedVlanIds: 'all' }
                      : undefined,
              });
            }}
          />
          {sp?.mode === 'access' ? (
            <Select
              label={t('network.vlan')}
              mono
              value={sp.accessVlanId ?? ''}
              options={vlanOptions}
              onChange={(e) =>
                update({
                  switchport: {
                    mode: 'access',
                    ...(e.target.value ? { accessVlanId: e.target.value } : {}),
                  },
                })
              }
            />
          ) : null}
          {sp?.mode === 'trunk' ? (
            <Select
              label={t('network.native')}
              mono
              value={sp.nativeVlanId ?? ''}
              options={vlanOptions}
              onChange={(e) =>
                update({ switchport: { ...sp, nativeVlanId: e.target.value || undefined } })
              }
            />
          ) : null}
        </Grid>
      ) : null}
      {sp?.mode === 'trunk' && showSwitchport ? (
        <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-0 p-0">
          <legend className="mb-1 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
            {t('network.allowed')}
          </legend>
          <Checkbox
            label={t('network.allVlans')}
            checked={sp.allowedVlanIds === 'all'}
            onChange={(e) =>
              update({ switchport: { ...sp, allowedVlanIds: e.target.checked ? 'all' : [] } })
            }
          />
          {sp.allowedVlanIds !== 'all'
            ? vlans.map((v) => {
                const allowed = Array.isArray(sp.allowedVlanIds) ? sp.allowedVlanIds : [];
                return (
                  <Checkbox
                    key={v.id}
                    label={`${v.vid} ${v.name}`}
                    checked={allowed.includes(v.id)}
                    onChange={(e) =>
                      update({
                        switchport: {
                          ...sp,
                          allowedVlanIds: e.target.checked
                            ? [...allowed, v.id]
                            : allowed.filter((id) => id !== v.id),
                        },
                      })
                    }
                  />
                );
              })
            : null}
        </fieldset>
      ) : null}

      {iface.kind === 'vlan' || iface.kind === 'vnic' ? (
        <CommitField
          label={t('network.vlanTag')}
          mono
          value={iface.vlanTag !== undefined ? String(iface.vlanTag) : ''}
          validate={(v) => (v === '' ? null : intValidator(1, 4094, t('errors.vlanTag'))(v))}
          onCommit={(v) => update({ vlanTag: v === '' ? undefined : Number(v) })}
        />
      ) : null}
      {showMembership ? (
        <Select
          label={t('network.bridge')}
          mono
          value={iface.parentId ?? ''}
          options={[
            { value: '', label: '—' },
            ...bridges.map((b) => ({ value: b.id, label: b.name })),
          ]}
          onChange={(e) => update({ parentId: e.target.value || undefined })}
        />
      ) : null}

      {iface.kind !== 'wifi-radio' && !(showMembership && iface.parentId) ? (
        <Grid>
          <Select
            label={t('network.addressing')}
            value={address?.mode ?? ''}
            options={[
              { value: '', label: t('network.noAddress') },
              { value: 'static', label: t('network.static') },
              { value: 'dhcp', label: t('network.dhcp') },
              { value: 'dhcp-reservation', label: t('network.reservation') },
            ]}
            onChange={(e) => {
              const mode = e.target.value as IpAssignment['mode'] | '';
              setAddress(
                mode
                  ? {
                      mode,
                      ...(mode !== 'dhcp' && address?.address ? { address: address.address } : {}),
                      ...(address?.subnetId ? { subnetId: address.subnetId } : {}),
                    }
                  : undefined,
              );
            }}
          />
          {address && address.mode !== 'dhcp' ? (
            <CommitField
              label={t('network.address')}
              mono
              value={address.address ?? ''}
              validate={(v) => (v === '' || isValidIp(v) ? null : t('errors.ip'))}
              onCommit={(v) => {
                const subnetId = v ? subnetForAddress(project, v) : undefined;
                setAddress({
                  mode: address.mode,
                  ...(v ? { address: v.trim() } : {}),
                  ...(subnetId ? { subnetId } : {}),
                });
              }}
            />
          ) : null}
        </Grid>
      ) : null}
      {address?.subnetId && project.subnets[address.subnetId] ? (
        <Row label={t('network.subnet')} value={project.subnets[address.subnetId]?.cidr ?? ''} />
      ) : null}
    </Card>
  );
}

function RoutingSection({
  project,
  device,
  interfaces,
}: {
  project: Project;
  device: Device;
  interfaces: Interface[];
}) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const { open: openDrawer } = useDrawer();
  const routes = Object.values(project.routes).filter((r) => r.deviceId === device.id);
  const wan = interfaces.find((i) => i.kind === 'wan');
  const firewall = device.firewall;
  return (
    <>
      <Section
        title={t('network.routes')}
        action={
          <AddButton
            label={t('network.addRoute')}
            onClick={() =>
              run(addRoute, {
                route: {
                  deviceId: device.id,
                  destination: '0.0.0.0/0',
                  ...(wan ? { interfaceId: wan.id } : {}),
                },
              })
            }
          />
        }
      >
        {routes.length === 0 ? (
          <p className="m-0 text-body-sm text-text-muted">{t('network.connectedRoutes')}</p>
        ) : null}
        {routes.map((route) => (
          <Card key={route.id}>
            <div className="flex items-end gap-2">
              <Grid>
                <CommitField
                  label={t('network.destination')}
                  mono
                  value={route.destination}
                  validate={(v) => (isValidCidr(v) ? null : t('errors.cidr'))}
                  onCommit={(destination) =>
                    run(updateRoute, { id: route.id, changes: { destination: destination.trim() } })
                  }
                />
                <CommitField
                  label={t('network.via')}
                  mono
                  value={route.via ?? ''}
                  validate={(v) => (v === '' || isValidIp(v) ? null : t('errors.ip'))}
                  onCommit={(via) =>
                    run(updateRoute, { id: route.id, changes: { via: via.trim() || undefined } })
                  }
                />
              </Grid>
              <RemoveButton
                label={t('actions.remove')}
                onClick={() => run(deleteRoute, { id: route.id })}
              />
            </div>
          </Card>
        ))}
      </Section>
      {firewall ? (
        <Section title={t('network.firewall')}>
          <Button onClick={() => openDrawer({ kind: 'firewall', deviceId: device.id })}>
            {t('network.openFirewall')}
          </Button>
          <Row
            label={t('network.rules')}
            value={t('network.ruleSummary', {
              count: firewall.rules.length,
              policy: firewall.defaultAction,
            })}
          />
          {firewall.nat.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2">
              <span className="flex-1 font-mono text-data text-text-secondary">
                {rule.kind === 'masquerade'
                  ? t('network.masquerade', {
                      out: project.interfaces[rule.outInterfaceId]?.name ?? '?',
                    })
                  : t('network.portForward', { port: rule.externalPort })}
              </span>
              <RemoveButton
                label={t('actions.remove')}
                onClick={() => run(deleteNatRule, { deviceId: device.id, ruleId: rule.id })}
              />
            </div>
          ))}
          {wan && !firewall.nat.some((r) => r.kind === 'masquerade') ? (
            <AddButton
              label={t('network.addMasquerade')}
              onClick={() =>
                run(addNatRule, {
                  deviceId: device.id,
                  rule: { kind: 'masquerade', outInterfaceId: wan.id },
                })
              }
            />
          ) : null}
        </Section>
      ) : null}
    </>
  );
}

const BANDS = ['2.4', '5', '6'] as const;

function WifiSection({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const ssids = device.wifi?.ssids ?? [];
  const vlans = Object.values(project.vlans).sort((a, b) => a.vid - b.vid);
  const setSsids = (next: Ssid[]) =>
    run(updateDevice, { id: device.id, changes: { wifi: { ssids: next } } });
  const setSsid = (id: string, changes: Partial<Ssid>) =>
    setSsids(ssids.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  return (
    <Section
      title={t('network.wifi')}
      action={
        <AddButton
          label={t('network.addSsid')}
          onClick={() =>
            setSsids([
              ...ssids,
              {
                id: `ssid-${crypto.randomUUID().slice(0, 8)}`,
                name: `SSID ${ssids.length + 1}`,
                bands: ['2.4', '5'],
                clientIsolation: false,
                security: 'wpa3',
              },
            ])
          }
        />
      }
    >
      {ssids.map((ssid) => (
        <Card key={ssid.id}>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <CommitField
                label={t('network.ssidName')}
                value={ssid.name}
                onCommit={(name) => name && setSsid(ssid.id, { name })}
              />
            </div>
            <RemoveButton
              label={t('actions.remove')}
              onClick={() => setSsids(ssids.filter((s) => s.id !== ssid.id))}
            />
          </div>
          <Grid>
            <Select
              label={t('network.vlan')}
              mono
              value={ssid.vlanId ?? ''}
              options={[
                { value: '', label: '—' },
                ...vlans.map((v) => ({ value: v.id, label: `${v.vid} · ${v.name}` })),
              ]}
              onChange={(e) => setSsid(ssid.id, { vlanId: e.target.value || undefined })}
            />
            <Select
              label={t('network.security')}
              value={ssid.security}
              options={[
                { value: 'wpa3', label: 'WPA3' },
                { value: 'wpa2', label: 'WPA2' },
                { value: 'open', label: t('network.open') },
              ]}
              onChange={(e) => setSsid(ssid.id, { security: e.target.value as Ssid['security'] })}
            />
          </Grid>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {BANDS.map((band) => (
              <Checkbox
                key={band}
                label={`${band} GHz`}
                checked={ssid.bands.includes(band)}
                onChange={(e) =>
                  setSsid(ssid.id, {
                    bands: e.target.checked
                      ? [...ssid.bands, band]
                      : ssid.bands.filter((b) => b !== band),
                  })
                }
              />
            ))}
            <Checkbox
              label={t('network.isolation')}
              checked={ssid.clientIsolation}
              onChange={(e) => setSsid(ssid.id, { clientIsolation: e.target.checked })}
            />
          </div>
        </Card>
      ))}
    </Section>
  );
}
