import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Page } from '../shell/Page';

/** P-01 Projects — first-run state T-01 until persistence lands (MVP stage 2). */
export function ProjectsPage() {
  const { t } = useTranslation('projects');
  return (
    <Page>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-130 flex-col items-center gap-4 text-center">
          <h1 className="m-0 text-title-lg font-semibold">{t('firstRun.title')}</h1>
          <p className="m-0 leading-normal text-text-secondary">{t('firstRun.description')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button disabled>{t('firstRun.import')}</Button>
            <Button disabled>{t('firstRun.example')}</Button>
            <Button variant="primary" disabled>
              {t('firstRun.create')}
            </Button>
          </div>
        </div>
      </div>
    </Page>
  );
}
