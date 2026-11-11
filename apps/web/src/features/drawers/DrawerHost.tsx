import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/services';
import { Banner } from '../../ui/Banner';
import { Drawer } from '../../ui/Drawer';
import { useInspectorError } from '../inspector/parts';
import { FirewallDrawer } from './FirewallDrawer';
import { SettingsDrawer } from './SettingsDrawer';
import { TagsDrawer } from './TagsDrawer';
import { useDrawer } from './useDrawer';
import { VlansDrawer } from './VlansDrawer';

/** Renders the drawer named by `?panel=` (docs/07 § 5). */
export function DrawerHost() {
  const { t } = useTranslation('drawers');
  const { t: ti } = useTranslation('inspector');
  const project = useSession((s) => s.project);
  const { panel, close } = useDrawer();
  const error = useInspectorError((s) => s.error);
  if (!project || !panel) return null;

  const device = panel.kind === 'firewall' ? project.devices[panel.deviceId] : undefined;
  if (panel.kind === 'firewall' && !device?.firewall) return null;

  const title =
    panel.kind === 'vlans'
      ? t('vlans.title')
      : panel.kind === 'tags'
        ? t('tags.title')
        : panel.kind === 'settings'
          ? t('settings.title')
          : t('firewall.titleFor', { name: device?.name ?? '' });
  const subtitle =
    panel.kind === 'vlans'
      ? t('vlans.subtitle', {
          vlans: Object.keys(project.vlans).length,
          subnets: Object.keys(project.subnets).length,
          zones: Object.keys(project.zones).length,
        })
      : panel.kind === 'firewall'
        ? t('firewall.subtitle', { count: device?.firewall?.rules.length ?? 0 })
        : undefined;

  return (
    <Drawer
      open
      onClose={close}
      title={title}
      {...(subtitle ? { subtitle } : {})}
      closeLabel={t('close')}
    >
      {error ? (
        <Banner kind="error">
          {ti(`errors.${error.code}`, {
            defaultValue: ti('errors.generic', { code: error.code }),
            ...error.params,
          })}
        </Banner>
      ) : null}
      {panel.kind === 'vlans' ? <VlansDrawer project={project} /> : null}
      {panel.kind === 'tags' ? <TagsDrawer project={project} /> : null}
      {panel.kind === 'settings' ? <SettingsDrawer project={project} /> : null}
      {panel.kind === 'firewall' && device ? (
        <FirewallDrawer project={project} device={device} />
      ) : null}
    </Drawer>
  );
}
