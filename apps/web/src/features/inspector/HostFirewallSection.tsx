import {
  addHostFirewallRule,
  deleteHostFirewallRule,
  type HostFirewall,
  type HostFirewallOwner,
  type HostFirewallRule,
  moveHostFirewallRule,
  type Project,
  setHostFirewall,
  updateHostFirewallRule,
} from '@server-planner/model';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../../ui/Checkbox';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { EndpointPicker, formatPorts, IconMove, parsePorts } from '../drawers/FirewallDrawer';
import { AddButton, Card, CommitField, Grid, RemoveButton, Section, useCommand } from './parts';

/**
 * NET-15 host firewall (Proxmox firewall, ufw, Windows Firewall), simplified: on or off, the
 * default for incoming traffic and allow/deny rules on the source, first match wins.
 */
export function HostFirewallSection({
  project,
  owner,
  firewall,
}: {
  project: Project;
  owner: HostFirewallOwner;
  firewall: HostFirewall | undefined;
}) {
  const { t } = useTranslation('inspector');
  const td = useTranslation('drawers').t;
  const run = useCommand();
  const enabled = !!firewall?.enabled;
  const rules = firewall?.rules ?? [];
  const update = (rule: HostFirewallRule, changes: Partial<Omit<HostFirewallRule, 'id'>>) =>
    run(updateHostFirewallRule, { owner, id: rule.id, changes });
  return (
    <Section
      title={t('hostFirewall.title')}
      action={
        enabled ? (
          <AddButton
            label={t('hostFirewall.addRule')}
            onClick={() =>
              run(addHostFirewallRule, {
                owner,
                rule: { enabled: true, action: 'allow', protocol: 'tcp', source: { type: 'any' } },
              })
            }
          />
        ) : undefined
      }
    >
      <Checkbox
        label={t('hostFirewall.enabled')}
        checked={enabled}
        onChange={(e) => run(setHostFirewall, { owner, enabled: e.target.checked })}
      />
      {enabled ? (
        <>
          <Segmented
            label={t('hostFirewall.inbound')}
            value={firewall?.inbound ?? 'deny'}
            onChange={(inbound) => run(setHostFirewall, { owner, inbound })}
            options={[
              { value: 'deny', label: t('hostFirewall.deny') },
              { value: 'allow', label: t('hostFirewall.allow') },
            ]}
          />
          <p className="m-0 text-body-sm text-text-muted">{t('hostFirewall.hint')}</p>
        </>
      ) : null}
      {enabled
        ? rules.map((rule, index) => (
            <Card key={rule.id} label={t('hostFirewall.rule', { n: index + 1 })}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-data font-semibold">{`#${index + 1}`}</span>
                <Checkbox
                  label={td('firewall.enabled')}
                  checked={rule.enabled}
                  onChange={(e) => update(rule, { enabled: e.target.checked })}
                />
                <div className="grow" />
                <IconMove
                  label={td('firewall.moveUp')}
                  disabled={index === 0}
                  onClick={() => run(moveHostFirewallRule, { owner, id: rule.id, by: -1 })}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </IconMove>
                <IconMove
                  label={td('firewall.moveDown')}
                  disabled={index === rules.length - 1}
                  onClick={() => run(moveHostFirewallRule, { owner, id: rule.id, by: 1 })}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </IconMove>
                <RemoveButton
                  label={t('actions.remove')}
                  onClick={() => run(deleteHostFirewallRule, { owner, id: rule.id })}
                />
              </div>
              <Grid>
                <Select
                  label={td('firewall.action')}
                  value={rule.action}
                  options={[
                    { value: 'allow', label: td('firewall.allow') },
                    { value: 'deny', label: td('firewall.deny') },
                  ]}
                  onChange={(e) => update(rule, { action: e.target.value as 'allow' | 'deny' })}
                />
                <Select
                  label={td('firewall.protocol')}
                  mono
                  value={rule.protocol}
                  options={['any', 'tcp', 'udp', 'icmp'].map((p) => ({ value: p, label: p }))}
                  onChange={(e) =>
                    update(rule, { protocol: e.target.value as HostFirewallRule['protocol'] })
                  }
                />
              </Grid>
              <CommitField
                label={td('firewall.ports')}
                mono
                placeholder={td('firewall.allPorts')}
                value={formatPorts(rule.ports)}
                validate={(v) => (parsePorts(v) === null ? td('errors.ports') : null)}
                onCommit={(v) => update(rule, { ports: parsePorts(v) ?? undefined })}
              />
              <EndpointPicker
                label={td('firewall.source')}
                project={project}
                value={rule.source}
                onChange={(source) => update(rule, { source })}
              />
            </Card>
          ))
        : null}
    </Section>
  );
}
