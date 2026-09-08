import { useId, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };

export function FormField({ label, error, hint, id: suppliedId, ...input }: Props) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input {...input} id={id} aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-help` : undefined} />
      {error || hint ? <p id={`${id}-help`} className={error ? 'field-error' : 'muted'}>{error ?? hint}</p> : null}
    </div>
  );
}
