import {
  addFirewallRule,
  addNatRule,
  type Device,
  type DistributiveOmit,
  deleteFirewallRule,
  deleteNatRule,
  type Endpoint,
  type FirewallRule,
  isValidCidr,
  isValidIp,
  moveFirewallRule,
  type NatRule,
  type PortRange,
  type Project,
  updateDevice,
  updateFirewallRule,
  updateNatRule,
} from '@server-planner/model';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../../ui/Checkbox';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { Tabs } from '../../ui/Tabs';
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

type Tab = 'rules' | 'nat';

/** "80,443,8000-8100" ⇄ port ranges (empty = all ports). */
export function parsePorts(text: string): PortRange[] | undefined | null {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const ranges: PortRange[] = [];
  for (const part of trimmed.split(',')) {
    const match = /^\s*(\d{1,5})(?:\s*-\s*(\d{1,5}))?\s*$/.exec(part);
    if (!match) return null;
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    if (from < 1 || to > 65535 || from > to) return null;
    ranges.push({ from, to });
  }
  return ranges;
}
export const formatPorts = (ports: PortRange[] | undefined) =>
  (ports ?? []).map((p) => (p.from === p.to ? String(p.from) : `${p.from}-${p.to}`)).join(',');

/** S-02 Firewall rules and NAT of one router (NET-07, NET-08) — first match wins. */
export function FirewallDrawer({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('drawers');
  const [tab, setTab] = useState<Tab>('rules');
  return (
    <Tabs
      label={t('firewall.title')}
      value={tab}
      onChange={setTab}
      tabs={[
        { value: 'rules', label: t('firewall.tabs.rules') },
        { value: 'nat', label: t('firewall.tabs.nat') },
      ]}
    >
      {tab === 'rules' ? (
        <Rules project={project} device={device} />
      ) : (
        <Nat project={project} device={device} />
      )}
    </Tabs>
  );
}

function Rules({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('drawers');
  const run = useCommand();
  const firewall = device.firewall;
  if (!firewall) return null;
  const rules = firewall.rules;
  const update = (rule: FirewallRule, changes: Partial<Omit<FirewallRule, 'id'>>) =>
    run(updateFirewallRule, { deviceId: device.id, ruleId: rule.id, changes });

  return (
    <>
      <Section title={t('firewall.defaultPolicy')}>
        <Segmented
          label={t('firewall.defaultPolicy')}
          fill
          value={firewall.defaultAction}
          options={[
            { value: 'deny', label: t('firewall.deny') },
            { value: 'allow', label: t('firewall.allow') },
          ]}
          onChange={(defaultAction) =>
            run(updateDevice, {
              id: device.id,
              changes: { firewall: { ...firewall, defaultAction } },
            })
          }
        />
        <p className="m-0 text-body-sm text-text-muted">{t('firewall.statefulHint')}</p>
      </Section>
      <Section
        title={t('firewall.ruleCount', { count: rules.length })}
        action={
          <AddButton
            label={t('firewall.addRule')}
            onClick={() =>
              run(addFirewallRule, {
                deviceId: device.id,
                rule: {
                  enabled: true,
                  action: 'allow',
                  protocol: 'tcp',
                  source: { type: 'any' },
                  destination: { type: 'any' },
                },
              })
            }
          />
        }
      >
        <p className="m-0 text-body-sm text-text-muted">{t('firewall.orderHint')}</p>
        {rules.map((rule, index) => (
          <Card key={rule.id} label={t('firewall.ruleLabel', { n: index + 1 })}>
            <div className="flex items-center gap-2">
              <span className="font-mono text-data font-semibold">{`#${index + 1}`}</span>
              <span
                className={`rounded-sm px-1.5 font-mono text-badge font-semibold ${rule.action === 'allow' ? 'bg-ok-text/15 text-ok-text' : 'bg-error-bg text-error-text'}`}
              >
                {t(`firewall.${rule.action}`).toUpperCase()}
              </span>
              <Checkbox
                label={t('firewall.enabled')}
                checked={rule.enabled}
                onChange={(e) => update(rule, { enabled: e.target.checked })}
              />
              <div className="grow" />
              <IconMove
                label={t('firewall.moveUp')}
                disabled={index === 0}
                onClick={() =>
                  run(moveFirewallRule, {
                    deviceId: device.id,
                    ruleId: rule.id,
                    toIndex: index - 1,
                  })
                }
              >
                <ArrowUp size={14} aria-hidden="true" />
              </IconMove>
              <IconMove
                label={t('firewall.moveDown')}
                disabled={index === rules.length - 1}
                onClick={() =>
                  run(moveFirewallRule, {
                    deviceId: device.id,
                    ruleId: rule.id,
                    toIndex: index + 1,
                  })
                }
              >
                <ArrowDown size={14} aria-hidden="true" />
              </IconMove>
              <RemoveButton
                label={t('actions.remove')}
                onClick={() => run(deleteFirewallRule, { deviceId: device.id, ruleId: rule.id })}
              />
            </div>
            <Grid cols={3}>
              <Select
                label={t('firewall.action')}
                value={rule.action}
                options={[
                  { value: 'allow', label: t('firewall.allow') },
                  { value: 'deny', label: t('firewall.deny') },
                ]}
                onChange={(e) => update(rule, { action: e.target.value as 'allow' | 'deny' })}
              />
              <Select
                label={t('firewall.protocol')}
                mono
                value={rule.protocol}
                options={['any', 'tcp', 'udp', 'icmp'].map((p) => ({ value: p, label: p }))}
                onChange={(e) =>
                  update(rule, { protocol: e.target.value as FirewallRule['protocol'] })
                }
              />
              <CommitField
                label={t('firewall.ports')}
                mono
                placeholder={t('firewall.allPorts')}
                value={formatPorts(rule.ports)}
                validate={(v) => (parsePorts(v) === null ? t('errors.ports') : null)}
                onCommit={(v) => update(rule, { ports: parsePorts(v) ?? undefined })}
              />
            </Grid>
            <Grid>
              <EndpointPicker
                label={t('firewall.source')}
                project={project}
                value={rule.source}
                onChange={(source) => update(rule, { source })}
              />
              <EndpointPicker
                label={t('firewall.destination')}
                project={project}
                value={rule.destination}
                onChange={(destination) => update(rule, { destination })}
              />
            </Grid>
            <CommitField
              label={t('firewall.description')}
              value={rule.description ?? ''}
              onCommit={(v) => update(rule, { description: v || undefined })}
            />
          </Card>
        ))}
      </Section>
    </>
  );
}

function IconMove({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-text-secondary hover:bg-tile-header disabled:opacity-45"
    >
      {children}
    </button>
  );
}

const ENDPOINT_TYPES = [
  'any',
  'internet',
  'zone',
  'subnet',
  'device',
  'workload',
  'app',
  'cidr',
] as const;

/** Rule endpoint: type + target (docs/02 § 6.3 Endpoint). */
export function EndpointPicker({
  label,
  project,
  value,
  onChange,
}: {
  label: string;
  project: Project;
  value: Endpoint;
  onChange: (endpoint: Endpoint) => void;
}) {
  const { t } = useTranslation('drawers');
  const targets: Record<
    'zone' | 'subnet' | 'device' | 'workload' | 'app',
    { value: string; label: string }[]
  > = {
    zone: Object.values(project.zones).map((z) => ({ value: z.id, label: z.name })),
    subnet: Object.values(project.subnets).map((s) => ({ value: s.id, label: s.cidr })),
    device: Object.values(project.devices)
      .filter((d) => d.kind !== 'internet')
      .map((d) => ({ value: d.id, label: d.name })),
    workload: Object.values(project.workloads).map((w) => ({ value: w.id, label: w.name })),
    app: Object.values(project.apps).map((a) => ({ value: a.id, label: a.name })),
  };
  const setType = (type: Endpoint['type']) => {
    if (type === 'any' || type === 'internet') onChange({ type });
    else if (type === 'cidr') onChange({ type, value: '0.0.0.0/0' });
    else {
      const first = targets[type][0];
      if (first) onChange({ type, id: first.value });
    }
  };
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <Select
          label={t('firewall.endpointType', { label })}
          hideLabel
          value={value.type}
          options={ENDPOINT_TYPES.filter(
            (type) =>
              type === 'any' || type === 'internet' || type === 'cidr' || targets[type].length > 0,
          ).map((type) => ({
            value: type,
            label: t(`firewall.endpoint.${type}`),
          }))}
          onChange={(e) => setType(e.target.value as Endpoint['type'])}
        />
        {value.type === 'cidr' ? (
          <CommitField
            label={t('firewall.endpointTarget', { label })}
            hideLabel
            mono
            value={value.value}
            validate={(v) => (isValidCidr(v) ? null : t('errors.cidr'))}
            onCommit={(v) => onChange({ type: 'cidr', value: v.trim() })}
          />
        ) : value.type !== 'any' && value.type !== 'internet' ? (
          <Select
            label={t('firewall.endpointTarget', { label })}
            hideLabel
            value={value.id}
            options={
              targets[value.type].some((o) => o.value === value.id)
                ? targets[value.type]
                : [{ value: value.id, label: t('firewall.missing') }, ...targets[value.type]]
            }
            onChange={(e) => onChange({ type: value.type, id: e.target.value } as Endpoint)}
          />
        ) : null}
      </div>
    </fieldset>
  );
}

function Nat({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('drawers');
  const run = useCommand();
  const nat = device.firewall?.nat ?? [];
  const interfaces = Object.values(project.interfaces).filter(
    (i) => i.owner.type === 'device' && i.owner.id === device.id,
  );
  const wan = interfaces.find((i) => i.kind === 'wan') ?? interfaces[0];
  const ifaceOptions = interfaces.map((i) => ({ value: i.id, label: i.name }));
  const apps = Object.values(project.apps);
  const save = (rule: NatRule, next: DistributiveOmit<NatRule, 'id'>) =>
    run(updateNatRule, { deviceId: device.id, ruleId: rule.id, rule: next });
  const portValidator = intValidator(1, 65535, t('errors.port'));
  if (!wan) return null;
  return (
    <Section
      title={t('firewall.natCount', { count: nat.length })}
      action={
        <div className="flex gap-1">
          <AddButton
            label={t('firewall.addMasquerade')}
            onClick={() =>
              run(addNatRule, {
                deviceId: device.id,
                rule: { kind: 'masquerade', outInterfaceId: wan.id },
              })
            }
          />
          <AddButton
            label={t('firewall.addForward')}
            onClick={() =>
              run(addNatRule, {
                deviceId: device.id,
                rule: {
                  kind: 'port-forward',
                  inInterfaceId: wan.id,
                  protocol: 'tcp',
                  externalPort: 443,
                  target: apps[0]
                    ? { appId: apps[0].id, port: 443 }
                    : { ip: '192.168.1.10', port: 443 },
                },
              })
            }
          />
        </div>
      }
    >
      {nat.map((rule) => (
        <Card key={rule.id} label={rule.kind}>
          <div className="flex items-end gap-2">
            {rule.kind === 'masquerade' ? (
              <div className="min-w-0 flex-1">
                <Select
                  label={t('firewall.masqueradeOut')}
                  mono
                  value={rule.outInterfaceId}
                  options={ifaceOptions}
                  onChange={(e) =>
                    save(rule, { kind: 'masquerade', outInterfaceId: e.target.value })
                  }
                />
              </div>
            ) : (
              <Grid cols={3}>
                <Select
                  label={t('firewall.inInterface')}
                  mono
                  value={rule.inInterfaceId}
                  options={ifaceOptions}
                  onChange={(e) => save(rule, { ...rule, inInterfaceId: e.target.value })}
                />
                <Select
                  label={t('firewall.protocol')}
                  mono
                  value={rule.protocol}
                  options={[
                    { value: 'tcp', label: 'tcp' },
                    { value: 'udp', label: 'udp' },
                  ]}
                  onChange={(e) =>
                    save(rule, { ...rule, protocol: e.target.value as 'tcp' | 'udp' })
                  }
                />
                <CommitField
                  label={t('firewall.externalPort')}
                  mono
                  value={String(rule.externalPort)}
                  validate={portValidator}
                  onCommit={(v) => save(rule, { ...rule, externalPort: Number(v) })}
                />
              </Grid>
            )}
            <RemoveButton
              label={t('actions.remove')}
              onClick={() => run(deleteNatRule, { deviceId: device.id, ruleId: rule.id })}
            />
          </div>
          {rule.kind === 'port-forward' ? (
            <Grid cols={3}>
              <Select
                label={t('firewall.target')}
                value={'appId' in rule.target ? `app:${rule.target.appId}` : 'ip'}
                options={[
                  ...apps.map((a) => ({ value: `app:${a.id}`, label: a.name })),
                  { value: 'ip', label: t('firewall.targetIp') },
                ]}
                onChange={(e) =>
                  save(rule, {
                    ...rule,
                    target:
                      e.target.value === 'ip'
                        ? { ip: '192.168.1.10', port: rule.target.port }
                        : { appId: e.target.value.slice(4), port: rule.target.port },
                  })
                }
              />
              {'ip' in rule.target ? (
                <CommitField
                  label={t('firewall.targetAddress')}
                  mono
                  value={rule.target.ip}
                  validate={(v) => (isValidIp(v) ? null : t('errors.ip'))}
                  onCommit={(v) =>
                    save(rule, { ...rule, target: { ip: v.trim(), port: rule.target.port } })
                  }
                />
              ) : (
                <span />
              )}
              <CommitField
                label={t('firewall.targetPort')}
                mono
                value={String(rule.target.port)}
                validate={portValidator}
                onCommit={(v) =>
                  save(rule, { ...rule, target: { ...rule.target, port: Number(v) } })
                }
              />
            </Grid>
          ) : null}
        </Card>
      ))}
    </Section>
  );
}
