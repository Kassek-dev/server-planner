import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { Led, type LedStatus } from '../../../ui/Led';
import { Menu } from '../../../ui/Menu';
import { TextField } from '../../../ui/TextField';

/**
 * P-05 Component gallery (#/dev/design) — every component and state in both themes.
 * Source of Playwright visual snapshots (docs/04 § 9). Add each new ui/ component here.
 */
export function DesignGallery() {
  const { t } = useTranslation('dev');
  return (
    <div className="min-h-full bg-app p-6 text-text-primary">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="m-0 text-title-lg font-semibold">{t('gallery.title')}</h1>
        <p className="m-0 text-text-secondary">{t('gallery.description')}</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <ThemePane theme="dark" />
        <ThemePane theme="light" />
      </div>
    </div>
  );
}

const surfaces = [
  'app',
  'panel',
  'canvas',
  'raised',
  'tile',
  'tile-header',
  'inset',
  'container',
] as const;
const statuses: LedStatus[] = ['ok', 'warning', 'error', 'info', 'off'];
const vlans = ['violet', 'sky', 'teal', 'pink', 'indigo', 'sand', 'lime', 'cyan'] as const;

function ThemePane({ theme }: { theme: 'dark' | 'light' }) {
  const { t } = useTranslation('dev');
  return (
    <section
      data-theme={theme}
      data-testid={`gallery-${theme}`}
      aria-label={t(theme === 'dark' ? 'gallery.themeDark' : 'gallery.themeLight')}
      className="flex flex-col gap-6 rounded-md border border-border-default bg-panel p-5 text-text-primary"
    >
      <span className="font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
        {t('gallery.theme')} · {t(theme === 'dark' ? 'gallery.themeDark' : 'gallery.themeLight')}
      </span>

      <Section title={t('gallery.sections.colors')}>
        <div className="grid grid-cols-4 gap-2">
          {surfaces.map((name) => (
            <div key={name} className="flex flex-col gap-1">
              <span
                className="h-10 rounded-md border border-border-default"
                style={{ background: `var(--sp-bg-${name})` }}
              />
              <span className="font-mono text-data-sm text-text-muted">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('gallery.sections.vlan')}>
        <div className="flex flex-wrap gap-3">
          {vlans.map((key) => (
            <span key={key} className="flex items-center gap-2 font-mono text-data">
              <span
                className="h-1.5 w-4.5 rounded-xs"
                style={{ background: `var(--sp-vlan-${key})` }}
              />
              {key}
            </span>
          ))}
        </div>
      </Section>

      <Section title={t('gallery.sections.typography')}>
        <div className="flex flex-col gap-2">
          <span className="text-title-lg font-semibold">{t('gallery.sample.title')}</span>
          <span className="text-title font-semibold">{t('gallery.sample.title')}</span>
          <span className="text-body">{t('gallery.sample.body')}</span>
          <span className="text-body-sm text-text-secondary">{t('gallery.sample.body')}</span>
          <span className="font-mono text-data text-text-secondary">
            {t('gallery.sample.data')}
          </span>
          <span className="font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
            {t('gallery.sample.label')}
          </span>
          <span className="w-fit rounded-sm bg-text-secondary px-1 font-mono text-badge font-semibold text-app">
            {t('gallery.sample.badge')}
          </span>
        </div>
      </Section>

      <Section title={t('gallery.sections.buttons')}>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">{t('gallery.buttons.primary')}</Button>
          <Button>{t('gallery.buttons.secondary')}</Button>
          <Button variant="ghost">{t('gallery.buttons.ghost')}</Button>
          <Button variant="danger">{t('gallery.buttons.danger')}</Button>
          <Button disabled>{t('gallery.buttons.disabled')}</Button>
          <Button size="sm">{t('gallery.buttons.secondary')}</Button>
        </div>
      </Section>

      <Section title={t('gallery.sections.fields')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label={t('gallery.field.label')} defaultValue={t('gallery.field.value')} />
          <TextField
            label={t('gallery.field.mono')}
            mono
            defaultValue={t('gallery.field.monoValue')}
          />
          <TextField
            label={t('gallery.field.label')}
            defaultValue=""
            error={t('gallery.field.error')}
          />
        </div>
      </Section>

      <Section title={t('gallery.sections.banners')}>
        <div className="flex flex-col gap-2">
          <Banner kind="warning">{t('gallery.banner.warning')}</Banner>
          <Banner kind="error">{t('gallery.banner.error')}</Banner>
          <Banner kind="info">{t('gallery.banner.info')}</Banner>
        </div>
      </Section>

      <Section title={t('gallery.sections.overlays')}>
        <Overlays />
      </Section>

      <Section title={t('gallery.sections.leds')}>
        <div className="flex flex-col gap-2">
          {statuses.map((status) => (
            <span key={status} className="flex items-center gap-2">
              <Led status={status} label={t(`gallery.led.${status}`)} />
              {t(`gallery.led.${status}`)}
            </span>
          ))}
        </div>
      </Section>
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
      <h2 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Overlays() {
  const { t } = useTranslation('dev');
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setOpen(true)}>{t('gallery.overlay.openDialog')}</Button>
      <Menu
        align="start"
        trigger={<Button>{t('gallery.overlay.openMenu')}</Button>}
        items={[
          { label: t('gallery.overlay.itemOpen'), onSelect: () => {} },
          { label: t('gallery.overlay.itemDelete'), onSelect: () => {}, danger: true },
        ]}
      />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('gallery.overlay.dialogTitle')}
        description={t('gallery.overlay.dialogBody')}
        closeLabel={t('gallery.buttons.secondary')}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t('gallery.buttons.secondary')}</Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              {t('gallery.buttons.danger')}
            </Button>
          </>
        }
      />
    </div>
  );
}
