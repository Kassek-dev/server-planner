import {
  type AppInstance,
  deleteApp,
  type Listener,
  type Project,
  type Resources,
  updateApp,
} from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { formatSize, parseSize } from '../../app/format';
import { catalogApp, useCatalog } from '../../catalog/store';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Select } from '../../ui/Select';
import { useSelection } from '../canvas/selection';
import { rootDevice } from './device/SoftwareTab';
import {
  AddButton,
  Breadcrumb,
  Card,
  CommitField,
  Grid,
  intValidator,
  RemoveButton,
  Row,
  Section,
  useCommand,
} from './parts';
import { hostPath, useOpenHost } from './WorkloadInspector';

const ROLES = ['app', 'database', 'cache', 'worker', 'proxy', 'dns', 'other'] as const;
type Changes = Partial<Omit<AppInstance, 'id'>>;

/** I-04 App (docs/05 § 5.4, SW-07). Catalog apps (stage 7) arrive with their data filled in. */
export function AppInspector({ project, app }: { project: Project; app: AppInstance }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const openHost = useOpenHost();
  const device = rootDevice(project, app.runsOn);
  const role = app.role ?? 'app';
  const update = (changes: Changes) => run(updateApp, { id: app.id, changes });
  const portValidator = intValidator(1, 65535, t('errors.port'));
  const setListener = (i: number, changes: Partial<Listener>) =>
    update({ listeners: app.listeners.map((l, j) => (j === i ? { ...l, ...changes } : l)) });
  const otherApps = Object.values(project.apps).filter((a) => a.id !== app.id);

  return (
    <>
      <div className="flex flex-col gap-1">
        <Breadcrumb
          items={[
            ...hostPath(project, app.runsOn).map((p) => ({
              label: p.label,
              onClick: () => openHost(p.ref, device?.id),
            })),
            { label: app.name },
          ]}
        />
        <h2 className="m-0 text-title font-semibold">{app.name}</h2>
        <span className="text-text-secondary">{t(`app.role.${role}`)}</span>
      </div>
      <Grid>
        <CommitField
          label={t('app.name')}
          value={app.name}
          onCommit={(name) => name && update({ name })}
        />
        <Select
          label={t('app.roleLabel')}
          value={app.role ?? 'app'}
          options={ROLES.map((r) => ({ value: r, label: t(`app.role.${r}`) }))}
          onChange={(e) => update({ role: e.target.value as AppInstance['role'] })}
        />
      </Grid>

      <Section
        title={t('app.listeners')}
        action={
          <AddButton
            label={t('app.addListener')}
            onClick={() =>
              update({
                listeners: [...app.listeners, { port: 8080, protocol: 'tcp', purpose: 'web-ui' }],
              })
            }
          />
        }
      >
        {app.listeners.map((l, i) => (
          <div key={`${l.port}-${l.protocol}-${i}`} className="flex items-end gap-2">
            <Grid cols={3}>
              <CommitField
                label={t('app.port')}
                mono
                value={String(l.port)}
                validate={portValidator}
                onCommit={(v) => setListener(i, { port: Number(v) })}
              />
              <Select
                label={t('app.protocol')}
                mono
                value={l.protocol}
                options={[
                  { value: 'tcp', label: 'tcp' },
                  { value: 'udp', label: 'udp' },
                ]}
                onChange={(e) => setListener(i, { protocol: e.target.value as 'tcp' | 'udp' })}
              />
              <CommitField
                label={t('app.purpose')}
                mono
                value={l.purpose ?? ''}
                onCommit={(v) => setListener(i, { purpose: v || undefined })}
              />
            </Grid>
            <RemoveButton
              label={t('actions.remove')}
              onClick={() => update({ listeners: app.listeners.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
      </Section>

      <Section title={t('app.requirements')}>
        {(['min', 'recommended'] as const).map((level) => {
          const r = app.requirements[level];
          const set = (changes: Partial<Resources>) =>
            update({ requirements: { ...app.requirements, [level]: { ...r, ...changes } } });
          return (
            <div key={level} className="flex flex-col gap-1.5">
              <span className="text-body-sm text-text-secondary">{t(`app.${level}`)}</span>
              <Grid cols={3}>
                <CommitField
                  label={t('app.cpu')}
                  mono
                  value={String(r.cpu)}
                  validate={(v) => (Number(v) >= 0 ? null : t('errors.number'))}
                  onCommit={(v) => set({ cpu: Number(v) })}
                />
                <CommitField
                  label={t('app.memory')}
                  mono
                  value={formatSize(r.memoryBytes)}
                  validate={(v) => (parseSize(v) !== undefined ? null : t('errors.size'))}
                  onCommit={(v) => set({ memoryBytes: parseSize(v) ?? r.memoryBytes })}
                />
                <CommitField
                  label={t('app.disk')}
                  mono
                  value={formatSize(r.diskBytes, true)}
                  validate={(v) => (parseSize(v) !== undefined ? null : t('errors.size'))}
                  onCommit={(v) => set({ diskBytes: parseSize(v) ?? r.diskBytes })}
                />
              </Grid>
            </div>
          );
        })}
      </Section>

      <LoadProfileSection app={app} update={update} />

      <Section
        title={t('app.dependencies')}
        action={
          <AddButton
            label={t('app.addDependency')}
            onClick={() =>
              update({
                dependencies: [...app.dependencies, { capability: 'postgresql', optional: false }],
              })
            }
          />
        }
      >
        {app.dependencies.map((d, i) => {
          const set = (changes: Partial<typeof d>) =>
            update({
              dependencies: app.dependencies.map((x, j) => (j === i ? { ...x, ...changes } : x)),
            });
          return (
            <Card key={`${d.capability}-${i}`}>
              <div className="flex items-end gap-2">
                <Grid>
                  <CommitField
                    label={t('app.capability')}
                    mono
                    value={d.capability}
                    onCommit={(capability) => capability && set({ capability })}
                  />
                  <Select
                    label={t('app.satisfiedBy')}
                    value={d.satisfiedBy ?? ''}
                    options={[
                      { value: '', label: '—' },
                      ...otherApps.map((a) => ({ value: a.id, label: a.name })),
                    ]}
                    onChange={(e) => set({ satisfiedBy: e.target.value || undefined })}
                  />
                </Grid>
                <RemoveButton
                  label={t('actions.remove')}
                  onClick={() =>
                    update({ dependencies: app.dependencies.filter((_, j) => j !== i) })
                  }
                />
              </div>
              <Checkbox
                label={t('app.optional')}
                checked={d.optional}
                onChange={(e) => set({ optional: e.target.checked })}
              />
            </Card>
          );
        })}
      </Section>

      <Section title={t('app.traffic')}>
        {app.trafficPatterns.length === 0 ? (
          <p className="m-0 text-body-sm text-text-muted">{t('app.noTraffic')}</p>
        ) : null}
        {app.trafficPatterns.map((p) => (
          <Row
            key={p.id}
            label={`${p.direction === 'inbound' ? '←' : '→'} ${p.purpose}`}
            value={`${p.peer.kind} · ${p.protocol}${p.port ? `/${p.port}` : ''}`}
          />
        ))}
        <Row label={t('app.confidence')} value={t(`app.confidenceLevel.${app.confidence}`)} />
      </Section>

      <Button
        variant="danger"
        onClick={() => {
          run(deleteApp, { id: app.id });
          useSelection
            .getState()
            .setDetail(
              app.runsOn.type === 'workload' ? { type: 'workload', id: app.runsOn.id } : null,
            );
        }}
      >
        {t('app.delete')}
      </Button>
    </>
  );
}

/** SW-08 load profile from the catalog: expected use in the Capacity tab (CAP-05). */
function LoadProfileSection({ app, update }: { app: AppInstance; update: (c: Changes) => void }) {
  const { t, i18n } = useTranslation('inspector');
  const catalog = useCatalog((s) => s.catalog);
  const profiles = app.catalogRef
    ? catalogApp(catalog, app.catalogRef.id)?.loadProfiles
    : undefined;
  if (!profiles?.length || (app.role !== undefined && app.role !== 'app')) return null;
  const text = (l: { en: string } & Record<string, string>) => l[i18n.language] ?? l.en;
  const current =
    profiles.find((p) => p.id === app.loadProfile?.profileId) ??
    profiles.find((p) => p.id === 'typical') ??
    profiles[0];
  if (!current) return null;
  const params = app.loadProfile?.params ?? {};
  return (
    <Section title={t('app.loadProfile')}>
      <Select
        label={t('app.profile')}
        value={current.id}
        options={profiles.map((p) => ({ value: p.id, label: text(p.name) }))}
        onChange={(e) => update({ loadProfile: { profileId: e.target.value, params } })}
      />
      {current.params?.length ? (
        <Grid>
          {current.params.map((param) => (
            <CommitField
              key={param.key}
              label={text(param.name)}
              mono
              value={String(params[param.key] ?? param.default)}
              validate={intValidator(
                param.min,
                param.max,
                t('errors.range', { min: param.min, max: param.max }),
              )}
              onCommit={(v) =>
                update({
                  loadProfile: {
                    profileId: current.id,
                    params: { ...params, [param.key]: Number(v) },
                  },
                })
              }
            />
          ))}
        </Grid>
      ) : null}
      <p className="m-0 text-body-sm text-text-muted">{t('app.loadProfileHint')}</p>
    </Section>
  );
}
