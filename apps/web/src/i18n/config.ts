import i18next from 'i18next';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';
import canvas from './locales/en/canvas.json';
import catalog from './locales/en/catalog.json';
import common from './locales/en/common.json';
import dev from './locales/en/dev.json';
import drawers from './locales/en/drawers.json';
import editor from './locales/en/editor.json';
import inspector from './locales/en/inspector.json';
import issues from './locales/en/issues.json';
import projects from './locales/en/projects.json';
import simulation from './locales/en/simulation.json';

/** i18n setup — docs/01 § 7. Only `en` for now; add a language by copying locales/en. */
export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = ['en'] as const;
export const NAMESPACES = [
  'common',
  'projects',
  'editor',
  'canvas',
  'catalog',
  'inspector',
  'drawers',
  'issues',
  'simulation',
  'dev',
] as const;

export const resources = {
  en: { common, projects, editor, canvas, catalog, inspector, drawers, issues, simulation, dev },
} as const;

export async function initI18n(): Promise<void> {
  await i18next
    .use(ICU)
    .use(initReactI18next)
    .init({
      resources,
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      ns: [...NAMESPACES],
      defaultNS: 'common',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
}
