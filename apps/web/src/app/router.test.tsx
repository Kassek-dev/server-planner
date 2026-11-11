import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './router';
import { createServices, ServicesProvider } from './services';

let n = 0;
async function renderAt(path: string) {
  const services = await createServices(`test-router-${++n}`);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ServicesProvider services={services}>
      <RouterProvider router={router} />
    </ServicesProvider>,
  );
  return services;
}

describe('router', () => {
  it('shows the first-run state at / when there are no projects', async () => {
    await renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Plan your home lab' })).toBeTruthy();
  });

  it('shows Not found for unknown routes', async () => {
    await renderAt('/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });

  it('shows Project not found for an unknown project id', async () => {
    await renderAt('/p/prj_missing');
    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeTruthy();
  });
});
