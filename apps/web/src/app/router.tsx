import { createHashRouter, type RouteObject } from 'react-router';
import { EditorPage } from '../features/editor/EditorPage';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { PlaceholderPage } from './routes/PlaceholderPage';

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
  { path: '/settings/:section?', element: <PlaceholderPage titleKey="pages.settings" stage={8} /> },
  { path: '/about/:section?', element: <PlaceholderPage titleKey="pages.about" stage={8} /> },
  { path: '/p/:projectId/*', Component: EditorPage },
  ...devRoutes,
  { path: '*', Component: NotFoundPage },
];

export const createAppRouter = () => createHashRouter(routes);
