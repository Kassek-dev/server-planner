import { createHashRouter, type RouteObject } from 'react-router';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { NotFoundPage } from './routes/NotFoundPage';

/** Routes — sitemap in docs/07 § 1. Hash routing for GitHub Pages (ADR 007). */
const devRoutes: RouteObject[] =
  import.meta.env.DEV || import.meta.env.VITE_DEV_GALLERY === 'true'
    ? [
        {
          path: '/dev/design',
          lazy: async () => ({
            Component: (await import('./dev/design/DesignGallery')).DesignGallery,
          }),
        },
      ]
    : [];

export const routes: RouteObject[] = [
  { path: '/', Component: ProjectsPage },
  {
    path: '/settings/:section?',
    lazy: async () => ({
      Component: (await import('../features/pages/SettingsPage')).SettingsPage,
    }),
  },
  {
    path: '/about/:section?',
    lazy: async () => ({ Component: (await import('../features/pages/AboutPage')).AboutPage }),
  },
  {
    // Editor (React Flow, engines later) loads on demand so the projects page stays light.
    path: '/p/:projectId/*',
    lazy: async () => ({ Component: (await import('../features/editor/EditorPage')).EditorPage }),
  },
  ...devRoutes,
  { path: '*', Component: NotFoundPage },
];

export const createAppRouter = () => createHashRouter(routes);
