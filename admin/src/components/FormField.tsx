import { useId, type FormEvent, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };

function field(event: FormEvent<HTMLElement>) {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement ? target : null;
}
export function clearValidation(event: FormEvent<HTMLElement>) { field(event)?.setCustomValidity(''); }
export function localizeValidation(event: FormEvent<HTMLElement>) {
  const input = field(event);
  if (!input || input.validity.customError) return;
  const value = input.validity;
  input.setCustomValidity(value.valueMissing ? 'יש למלא את השדה.'
    : value.rangeUnderflow || value.rangeOverflow ? 'הערך חייב להיות בטווח המותר בשדה.'
    : value.stepMismatch ? 'יש להזין ערך במרווח המותר בשדה.'
    : value.tooShort ? 'הערך קצר מדי.' : 'בדקו את הערך שהזנתם ואת הפורמט הנדרש.');
}

const ltrNames = new Set(['sku_code', 'confirm_order_number', 'slug', 'image_key', 'admin_label_en', 'label_en', 'pattern', 'tracking_number', 'tracking_url', 'actor_id', 'target_id', 'target_type', 'action', 'product_type']);

export function FormField({ label, error, hint, id: suppliedId, ...input }: Props) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input dir={input.type && ['tel', 'url', 'email', 'number', 'time', 'datetime-local'].includes(input.type) || ltrNames.has(input.name ?? '') || input.autoComplete === 'one-time-code' ? 'ltr' : 'auto'}
        onInvalid={localizeValidation} onInput={clearValidation} {...input} id={id} aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-help` : undefined} />
      {error || hint ? <p id={`${id}-help`} className={error ? 'field-error' : 'muted'}>{error ?? hint}</p> : null}
    </div>
  );
}
