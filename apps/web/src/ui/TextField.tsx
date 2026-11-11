import { type InputHTMLAttributes, useId } from 'react';

/** Text field — docs/04 § 6.3: label above (mono caps), 32 px, inset background, accent focus. */
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  mono?: boolean;
  error?: string;
}

export function TextField({ label, mono = false, error, id, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase"
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={[
          'h-8 rounded-md border bg-inset px-2.5 text-body text-text-primary outline-none',
          'focus:border-accent',
          error ? 'border-error' : 'border-border-default',
          mono ? 'font-mono' : 'font-sans',
        ].join(' ')}
        {...rest}
      />
      {error ? (
        <span id={errorId} className="text-body-sm text-error-text">
          {error}
        </span>
      ) : null}
    </div>
  );
}
