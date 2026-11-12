import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';
import { downloadBlob } from '../../app/download';
import { formatSize } from '../../app/format';
import { useServices } from '../../app/services';
import { getThemePreference, setThemePreference, type ThemePreference } from '../../app/theme';
import { useCatalog } from '../../catalog/store';
import {
  type CatalogUpdateState,
  type CheckResult,
  checkForUpdate,
  readUpdateState,
  rollBack,
  setAutoCheck,
} from '../../catalog/updates';
import { exportBlob, exportFileName } from '../../persistence/backup';
import {
  getStorageStatus,
  requestPersistence,
  type StorageStatus,
} from '../../persistence/storage';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Led } from '../../ui/Led';
import { SegmentBar } from '../../ui/SegmentBar';
import { Segmented } from '../../ui/Segmented';
import { PageTitle, SectionLayout, SettingCard } from './SectionLayout';

const SECTIONS = ['appearance', 'catalog', 'units', 'storage'] as const;
type Section = (typeof SECTIONS)[number];

/** P-02 Settings (docs/07): Appearance and Storage (P0), Catalog and Units (P1, informational). */
export function SettingsPage() {
  const { t } = useTranslation('pages');
  const { section } = useParams();
  if (!SECTIONS.includes(section as Section)) return <Navigate to="/settings/appearance" replace />;
  return (
    <SectionLayout
      title={t('settings.title')}
      base="/settings"
      sections={SECTIONS.map((id) => ({ id, label: t(`settings.sections.${id}`) }))}
    >
      {section === 'appearance' ? <Appearance /> : null}
      {section === 'catalog' ? <CatalogInfo /> : null}
      {section === 'units' ? <Units /> : null}
      {section === 'storage' ? <Storage /> : null}
    </SectionLayout>
  );
}

function Appearance() {
  const { t } = useTranslation('pages');
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  return (
    <>
      <PageTitle>{t('settings.sections.appearance')}</PageTitle>
      <SettingCard title={t('settings.theme.title')} description={t('settings.theme.description')}>
        <Segmented
          label={t('settings.theme.title')}
          value={theme}
          onChange={(next) => {
            setThemePreference(next);
            setTheme(next);
          }}
          options={(['system', 'dark', 'light'] as const).map((v) => ({
            value: v,
            label: t(`settings.theme.${v}`),
          }))}
        />
      </SettingCard>
    </>
  );
}

function CatalogInfo() {
  const { t } = useTranslation('pages');
  const { repository } = useServices();
  const catalog = useCatalog((s) => s.catalog);
  const downloaded = useCatalog((s) => s.downloaded);
  const [state, setState] = useState<CatalogUpdateState | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const refresh = async () => setState(await readUpdateState(repository));
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    void useCatalog.getState().load();
    void refresh();
  }, []);

  const check = async () => {
    setChecking(true);
    setResult(await checkForUpdate(repository));
    setChecking(false);
    await refresh();
  };
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en') : '—');
  const sources = catalog?.sources ?? [];

  return (
    <>
      <PageTitle>{t('settings.sections.catalog')}</PageTitle>
      <SettingCard
        title={t('settings.catalog.version', { version: catalog?.catalogVersion ?? '…' })}
        description={t('settings.catalog.description', {
          apps: catalog?.apps.length ?? 0,
          devices: catalog?.devices.length ?? 0,
          cpus: catalog?.cpus.length ?? 0,
          date: date(catalog?.generatedAt),
        })}
      >
        <span className="flex gap-2">
          {downloaded ? (
            <Button
              onClick={async () => {
                await rollBack(repository);
                setResult(null);
                await refresh();
              }}
            >
              {t('settings.catalog.rollBack')}
            </Button>
          ) : null}
          <Button variant="primary" disabled={checking} onClick={() => void check()}>
            {checking ? t('settings.catalog.checking') : t('settings.catalog.checkNow')}
          </Button>
        </span>
      </SettingCard>
      {result ? (
        <Banner kind={result === 'updated' || result === 'up-to-date' ? 'info' : 'warning'}>
          {t(`settings.catalog.result.${result}`)}
        </Banner>
      ) : null}
      <SettingCard
        title={t('settings.catalog.autoCheck')}
        description={t('settings.catalog.autoCheckDescription', { last: date(state?.lastCheckAt) })}
      >
        <Segmented
          label={t('settings.catalog.autoCheck')}
          value={state?.autoCheck === false ? 'off' : 'on'}
          onChange={async (v) => {
            await setAutoCheck(repository, v === 'on');
            await refresh();
          }}
          options={[
            { value: 'on', label: t('settings.catalog.on') },
            { value: 'off', label: t('settings.catalog.off') },
          ]}
        />
      </SettingCard>
      <section className="flex flex-col gap-2">
        <h2 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
          {t('settings.catalog.sources')}
        </h2>
        {sources.length === 0 ? (
          <p className="m-0 text-text-secondary">{t('settings.catalog.curatedOnly')}</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="font-mono text-label tracking-[0.08em] text-text-secondary uppercase">
                <th className="py-2 font-semibold">{t('settings.catalog.columns.source')}</th>
                <th className="py-2 font-semibold">{t('settings.catalog.columns.status')}</th>
                <th className="py-2 font-semibold">{t('settings.catalog.columns.records')}</th>
                <th className="py-2 font-semibold">{t('settings.catalog.columns.fetched')}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-t border-border-subtle">
                  <td className="py-2 pr-4">{s.name}</td>
                  <td className="py-2 pr-4">
                    <span className="flex items-center gap-1.5">
                      <Led
                        status={
                          s.status === 'ok' ? 'ok' : s.status === 'stale' ? 'warning' : 'error'
                        }
                        size={7}
                      />
                      {t(`settings.catalog.status.${s.status}`)}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-data">{s.records}</td>
                  <td className="py-2 font-mono text-data">{date(s.fetchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function Units() {
  const { t } = useTranslation('pages');
  return (
    <>
      <PageTitle>{t('settings.sections.units')}</PageTitle>
      <p className="m-0 leading-normal text-text-secondary">{t('settings.units.description')}</p>
    </>
  );
}

/** Browser usage is often a few hundred KB — show KB/MB below a gigabyte-friendly size. */
const storageSize = (bytes: number) =>
  bytes < 1e6
    ? `${Math.max(1, Math.round(bytes / 1e3))} KB`
    : bytes < 1e9
      ? `${Math.round(bytes / 1e6)} MB`
      : formatSize(bytes, true);

function Storage() {
  const { t } = useTranslation('pages');
  const { repository, session } = useServices();
  const navigate = useNavigate();
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [projects, setProjects] = useState(0);
  const [lastExport, setLastExport] = useState<string | undefined>();
  const [confirm, setConfirm] = useState(false);

  const refresh = async () => {
    const [s, list, backup] = await Promise.all([
      getStorageStatus(),
      repository.list(),
      repository.getBackupState(),
    ]);
    setStatus(s);
    setProjects(list.length);
    setLastExport(backup.lastExportAt);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    void refresh();
  }, []);

  const exportAll = async () => {
    for (const meta of await repository.list()) {
      const project = await repository.get(meta.id);
      if (project) downloadBlob(exportBlob(project), exportFileName(project));
    }
    await repository.recordExport();
    await refresh();
  };

  const deleteAll = async () => {
    await session.clear();
    await repository.deleteAll();
    setConfirm(false);
    navigate('/');
  };

  const used = status?.usageBytes ?? 0;
  const quota = status?.quotaBytes;
  return (
    <>
      <PageTitle>{t('settings.sections.storage')}</PageTitle>
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span>{t('settings.storage.used')}</span>
          <span className="ml-auto font-mono text-data text-text-secondary">
            {quota
              ? t('settings.storage.usage', {
                  used: storageSize(used),
                  quota: formatSize(quota, true),
                })
              : t('settings.storage.unknown')}
          </span>
        </div>
        {quota ? (
          <SegmentBar
            ratio={used / quota}
            segments={40}
            height={6}
            label={t('settings.storage.used')}
            warning={0.7}
            critical={0.9}
          />
        ) : null}
      </section>
      <SettingCard
        title={t('settings.storage.persistence')}
        description={
          status?.persisted ? t('settings.storage.persisted') : t('settings.storage.notPersisted')
        }
      >
        <span className="flex items-center gap-2">
          <Led status={status?.persisted ? 'ok' : 'warning'} />
          {status?.persisted ? null : (
            <Button
              variant="primary"
              onClick={async () => {
                await requestPersistence();
                await refresh();
              }}
            >
              {t('settings.storage.request')}
            </Button>
          )}
        </span>
      </SettingCard>
      <SettingCard
        title={t('settings.storage.backups')}
        description={t('settings.storage.backupsDescription', {
          count: projects,
          last: lastExport ? new Date(lastExport).toLocaleDateString('en') : 'never',
        })}
      >
        <Button disabled={projects === 0} onClick={() => void exportAll()}>
          {t('settings.storage.exportAll')}
        </Button>
      </SettingCard>
      <section className="flex flex-col gap-2.5 rounded-md border border-error-border p-4">
        <h2 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-error-text uppercase">
          {t('settings.storage.danger')}
        </h2>
        <div className="flex items-center gap-6">
          <p className="m-0 flex-1 text-body-sm text-text-secondary">
            {t('settings.storage.deleteDescription')}
          </p>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            {t('settings.storage.deleteAll')}
          </Button>
        </div>
      </section>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('settings.storage.confirmTitle')}
        description={t('settings.storage.confirmDescription', { count: projects })}
        closeLabel={t('settings.storage.cancel')}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>{t('settings.storage.cancel')}</Button>
            <Button variant="danger" onClick={() => void deleteAll()}>
              {t('settings.storage.deleteAll')}
            </Button>
          </>
        }
      />
    </>
  );
}
