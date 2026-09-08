import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

/** Defaults to a non-submit button; forms must explicitly opt into submission. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', loading = false, disabled, type = 'button', className = '', children, ...props }, ref,
) {
  return <button {...props} ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
    className={['ui-button', `ui-button--${variant}`, `ui-button--${size}`, className].filter(Boolean).join(' ')}>
    {children}
  </button>;
});
