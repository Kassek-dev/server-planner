import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';
import { downloadBlob } from '../../app/download';
import { formatSize } from '../../app/format';
import { useServices } from '../../app/services';
import { getThemePreference, setThemePreference, type ThemePreference } from '../../app/theme';
import { useCatalog } from '../../catalog/store';
import { exportBlob, exportFileName } from '../../persistence/backup';
import {
  getStorageStatus,
  requestPersistence,
  type StorageStatus,
} from '../../persistence/storage';
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
  const catalog = useCatalog((s) => s.catalog);
  useEffect(() => {
    void useCatalog.getState().load();
  }, []);
  return (
    <>
      <PageTitle>{t('settings.sections.catalog')}</PageTitle>
      <SettingCard
        title={t('settings.catalog.version', { version: catalog?.catalogVersion ?? '…' })}
        description={t('settings.catalog.description', {
          apps: catalog?.apps.length ?? 0,
          devices: catalog?.devices.length ?? 0,
          cpus: catalog?.cpus.length ?? 0,
        })}
      />
      <p className="m-0 text-text-secondary">{t('settings.catalog.updates')}</p>
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
