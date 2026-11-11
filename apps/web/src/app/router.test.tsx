import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './router';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

describe('router', () => {
  it('shows the first-run projects page at /', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Plan your home lab' })).toBeTruthy();
  });

  it('shows Not found for unknown routes', async () => {
    renderAt('/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });
});
