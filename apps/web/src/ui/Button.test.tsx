import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders an accessible button with type="button" by default', () => {
    render(<Button>Export</Button>);
    const button = screen.getByRole('button', { name: 'Export' });
    expect(button.getAttribute('type')).toBe('button');
  });

  it('uses token-based classes for the primary variant', () => {
    render(<Button variant="primary">Simulate</Button>);
    const button = screen.getByRole('button', { name: 'Simulate' });
    expect(button.className).toContain('bg-accent');
    expect(button.className).toContain('text-on-accent');
  });

  it('can be disabled', () => {
    render(<Button disabled>Import JSON</Button>);
    expect(screen.getByRole('button', { name: 'Import JSON' }).hasAttribute('disabled')).toBe(true);
  });
});
