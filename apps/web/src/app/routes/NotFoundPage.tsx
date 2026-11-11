import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { Page } from '../shell/Page';

/** P-04 Not found. */
export function NotFoundPage({ project = false }: { project?: boolean }) {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  return (
    <Page>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="m-0 text-title-lg font-semibold">
            {t(project ? 'notFound.projectTitle' : 'notFound.title')}
          </h1>
          <p className="m-0 text-text-secondary">{t('notFound.description', { path: pathname })}</p>
          <Link to="/">{t('nav.backToProjects')}</Link>
        </div>
      </div>
    </Page>
  );
}
