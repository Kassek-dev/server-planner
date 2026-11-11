import { type InputHTMLAttributes, useId } from 'react';

export function Checkbox({
  label,
  id,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className="flex cursor-pointer items-center gap-2 text-body">
      <input id={inputId} type="checkbox" className="size-3.5 accent-accent" {...rest} />
      {label}
    </label>
  );
}
