import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Button — docs/04 § 6.1. One `primary` per area. Icon-only buttons need `aria-label`. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'touch';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent font-semibold hover:bg-accent-hover',
  secondary: 'border border-border-default text-text-primary font-medium hover:bg-tile-header',
  ghost: 'text-accent-text font-medium hover:bg-tile-header',
  danger: 'border border-error-border text-error-text font-medium hover:bg-error-bg',
};

const sizeClass: Record<ButtonSize, string> = {
  md: 'h-8 px-3 text-body',
  sm: 'h-7 px-2.5 text-body-sm',
  touch: 'h-11 px-4 text-body',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md',
        'transition-colors duration-(--sp-duration-fast) ease-(--sp-ease-out)',
        'disabled:pointer-events-none disabled:opacity-45',
        variantClass[variant],
        sizeClass[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
