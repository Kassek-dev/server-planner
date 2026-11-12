import {
  type Assertion,
  addAssertion,
  type Protocol,
  updateAssertion,
} from '@server-planner/model';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices, useSession } from '../../app/services';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { TextField } from '../../ui/TextField';
import { endpointFromValue, endpointGroups, endpointValue } from './endpoints';

const PROTOCOLS: Protocol[] = ['tcp', 'udp', 'icmp', 'any'];

export type AssertionDraft = Omit<Assertion, 'id'>;

/** D-11 Save as assertion / edit an assertion (SIM-06): name, endpoints, service, expectation. */
export function AssertionDialog({
  open,
  onOpenChange,
  initial,
  editId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AssertionDraft;
  /** Edits this assertion instead of adding a new one. */
  editId?: string;
}) {
  const { t } = useTranslation('views');
  const { session } = useServices();
  const project = useSession((s) => s.project);
  const [form, setForm] = useState(() => toForm(initial));
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens
  useEffect(() => {
    if (open) setForm(toForm(initial));
  }, [open]);
  if (!project) return null;

  const options = [
    { value: 'any', label: t('access.endpoint.any') },
    { value: 'internet', label: t('access.endpoint.internet') },
    ...endpointGroups(project).flatMap((g) =>
      g.options.map((o) => ({
        value: o.value,
        label: `${o.label} · ${t(`access.groups.${g.key}`)}`,
      })),
    ),
  ];
  const source = endpointFromValue(project, form.source);
  const destination = endpointFromValue(project, form.destination);
  const portless = form.protocol === 'icmp' || form.protocol === 'any';
  const port = portless || !form.port ? undefined : Number(form.port);
  const valid = !!source && !!destination && (port === undefined || (port >= 1 && port <= 65535));

  const save = () => {
    if (!source || !destination || !valid) return;
    const name = form.name.trim();
    const assertion: AssertionDraft = {
      ...(name ? { name } : {}),
      source,
      destination,
      protocol: form.protocol,
      ...(port !== undefined ? { port } : {}),
      expect: form.expect,
      enabled: initial.enabled,
    };
    if (editId)
      session.dispatch(updateAssertion, {
        id: editId,
        changes: { ...assertion, name: name || undefined, port },
      });
    else session.dispatch(addAssertion, { assertion });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editId ? t('access.dialog.editTitle') : t('access.dialog.title')}
      description={t('access.dialog.description')}
      closeLabel={t('access.dialog.cancel')}
      width={560}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('access.dialog.cancel')}</Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            {t('access.dialog.save')}
          </Button>
        </>
      }
    >
      <TextField
        label={t('access.dialog.name')}
        value={form.name}
        placeholder={t('access.dialog.namePlaceholder')}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label={t('access.dialog.source')}
          value={form.source}
          onChange={(e) => setForm({ ...form, source: e.target.value })}
          options={options}
        />
        <Select
          label={t('access.dialog.destination')}
          value={form.destination}
          onChange={(e) => setForm({ ...form, destination: e.target.value })}
          options={options}
        />
        <Select
          label={t('access.dialog.protocol')}
          mono
          value={form.protocol}
          onChange={(e) => setForm({ ...form, protocol: e.target.value as Protocol })}
          options={PROTOCOLS.map((p) => ({ value: p, label: p.toUpperCase() }))}
        />
        <TextField
          label={t('access.dialog.port')}
          mono
          inputMode="numeric"
          disabled={portless}
          value={portless ? '' : form.port}
          onChange={(e) => setForm({ ...form, port: e.target.value.replace(/\D/g, '') })}
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="flex-1">{t('access.dialog.expect')}</span>
        <Segmented
          label={t('access.dialog.expect')}
          value={form.expect}
          onChange={(expect) => setForm({ ...form, expect })}
          options={[
            { value: 'reachable', label: t('access.expect.reachable') },
            { value: 'blocked', label: t('access.expect.blocked') },
          ]}
        />
      </div>
    </Dialog>
  );
}

function toForm(a: AssertionDraft) {
  return {
    name: a.name ?? '',
    source: endpointValue(a.source),
    destination: endpointValue(a.destination),
    protocol: a.protocol,
    port: a.port === undefined ? '' : String(a.port),
    expect: a.expect,
  };
}
