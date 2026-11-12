import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';
import { useCatalog } from '../../catalog/store';
import { APP_VERSION } from '../../persistence/backup';
import { PageTitle, SectionLayout, SettingCard } from './SectionLayout';

const SECTIONS = ['overview', 'data-sources', 'licenses'] as const;
type Section = (typeof SECTIONS)[number];

const REPO = 'https://github.com/Kassek-dev/server-planner';

/** Catalog sources (docs/06 § 1, § 5). In the MVP only the curated layer ships; the rest come with 1.1. */
const SOURCES = [
  { id: 'curated', url: `${REPO}/tree/main/catalog/curated`, license: 'CC BY-SA 4.0', used: true },
  {
    id: 'awesome-selfhosted',
    url: 'https://github.com/awesome-selfhosted/awesome-selfhosted-data',
    license: 'CC BY-SA 3.0',
    used: false,
  },
  {
    id: 'community-scripts',
    url: 'https://github.com/community-scripts/ProxmoxVE',
    license: 'MIT',
    used: false,
  },
  { id: 'linuxserver', url: 'https://www.linuxserver.io', license: 'facts', used: false },
  { id: 'docker-hub', url: 'https://hub.docker.com', license: 'facts', used: false },
  { id: 'blender', url: 'https://opendata.blender.org', license: 'facts', used: false },
  { id: 'wikidata', url: 'https://www.wikidata.org', license: 'CC0 1.0', used: false },
] as const;

/** P-03 About (docs/07): overview, catalog data sources with licenses, open-source licenses. */
export function AboutPage() {
  const { t } = useTranslation('pages');
  const { section } = useParams();
  if (!SECTIONS.includes(section as Section)) return <Navigate to="/about/overview" replace />;
  return (
    <SectionLayout
      title={t('about.title')}
      base="/about"
      sections={SECTIONS.map((id) => ({ id, label: t(`about.sections.${id}`) }))}
    >
      {section === 'overview' ? <Overview /> : null}
      {section === 'data-sources' ? <DataSources /> : null}
      {section === 'licenses' ? <Licenses /> : null}
    </SectionLayout>
  );
}

function External({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-text hover:underline"
    >
      {children}
    </a>
  );
}

function Overview() {
  const { t } = useTranslation('pages');
  return (
    <>
      <PageTitle>{t('about.sections.overview')}</PageTitle>
      <p className="m-0 max-w-160 leading-normal text-text-secondary">
        {t('about.overview.description')}
      </p>
      <dl className="m-0 grid grid-cols-[160px_1fr] gap-x-6 gap-y-2">
        <dt className="text-text-secondary">{t('about.overview.version')}</dt>
        <dd className="m-0 font-mono">{APP_VERSION}</dd>
        <dt className="text-text-secondary">{t('about.overview.license')}</dt>
        <dd className="m-0">{t('about.overview.licenseValue')}</dd>
        <dt className="text-text-secondary">{t('about.overview.source')}</dt>
        <dd className="m-0">
          <External href={REPO}>{REPO.replace('https://', '')}</External>
        </dd>
        <dt className="text-text-secondary">{t('about.overview.bugs')}</dt>
        <dd className="m-0">
          <External href={`${REPO}/issues`}>{t('about.overview.reportBug')}</External>
        </dd>
        <dt className="text-text-secondary">{t('about.overview.privacy')}</dt>
        <dd className="m-0">{t('about.overview.privacyValue')}</dd>
      </dl>
      <SettingCard
        title={t('about.recommended.title')}
        description={t('about.recommended.description')}
      >
        <External href="https://selfh.st">{t('about.recommended.open')}</External>
      </SettingCard>
    </>
  );
}

function DataSources() {
  const { t } = useTranslation('pages');
  const catalog = useCatalog((s) => s.catalog);
  useEffect(() => {
    void useCatalog.getState().load();
  }, []);
  return (
    <>
      <PageTitle>{t('about.sections.data-sources')}</PageTitle>
      <p className="m-0 max-w-160 leading-normal text-text-secondary">
        {t('about.sources.description', { version: catalog?.catalogVersion ?? '…' })}
      </p>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="font-mono text-label tracking-[0.08em] text-text-secondary uppercase">
            <th className="py-2 font-semibold">{t('about.sources.columns.source')}</th>
            <th className="py-2 font-semibold">{t('about.sources.columns.usedFor')}</th>
            <th className="py-2 font-semibold">{t('about.sources.columns.license')}</th>
            <th className="py-2 font-semibold">{t('about.sources.columns.status')}</th>
          </tr>
        </thead>
        <tbody>
          {SOURCES.map((s) => (
            <tr key={s.id} className="border-t border-border-subtle align-top">
              <td className="py-2.5 pr-4">
                <External href={s.url}>{t(`about.sources.items.${s.id}.name`)}</External>
              </td>
              <td className="py-2.5 pr-4 text-text-secondary">
                {t(`about.sources.items.${s.id}.usedFor`)}
              </td>
              <td className="py-2.5 pr-4 font-mono text-data">
                {s.license === 'facts' ? t('about.sources.facts') : s.license}
              </td>
              <td className="py-2.5 font-mono text-data">
                {s.used ? t('about.sources.inUse') : t('about.sources.planned')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

type License = { name: string; version: string; license: string; url?: string };

function Licenses() {
  const { t } = useTranslation('pages');
  const [list, setList] = useState<License[] | null>(null);
  useEffect(() => {
    void import('virtual:licenses').then((m) => setList(m.default));
  }, []);
  return (
    <>
      <PageTitle>{t('about.sections.licenses')}</PageTitle>
      <p className="m-0 leading-normal text-text-secondary">
        {t('about.licenses.description', { count: list?.length ?? 0 })}
      </p>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="font-mono text-label tracking-[0.08em] text-text-secondary uppercase">
            <th className="py-2 font-semibold">{t('about.licenses.columns.package')}</th>
            <th className="py-2 font-semibold">{t('about.licenses.columns.version')}</th>
            <th className="py-2 font-semibold">{t('about.licenses.columns.license')}</th>
          </tr>
        </thead>
        <tbody>
          {(list ?? []).map((p) => (
            <tr key={`${p.name}@${p.version}`} className="border-t border-border-subtle">
              <td className="py-1.5 pr-4">
                {p.url ? <External href={p.url}>{p.name}</External> : p.name}
              </td>
              <td className="py-1.5 pr-4 font-mono text-data text-text-secondary">{p.version}</td>
              <td className="py-1.5 font-mono text-data">{p.license}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
