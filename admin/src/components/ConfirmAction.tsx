import { useEffect, useId, useRef, useState } from 'react';
import { ProblemBanner } from './ProblemBanner';

type Props = {
  label: string;
  recordLabel: string;
  amountAgorot?: number;
  description?: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => Promise<void>;
};

export function ConfirmAction(props: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <>
    <button type="button" ref={trigger} onClick={() => setOpen(true)}>{props.label}</button>
    {open ? <ConfirmationDialog {...props} close={close} /> : null}
  </>;
}

function ConfirmationDialog({ label, recordLabel, amountAgorot, description, tone = 'primary', onConfirm, close }: Props & { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => { element?.close(); };
  }, []);

  function dismiss() {
    // Release the native modal's inert background before restoring trigger focus.
    dialog.current?.close();
    close();
  }

  async function confirm() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await onConfirm(); dismiss(); }
    catch (error) { setError(error); }
    finally { pending.current = false; setBusy(false); }
  }

  return <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-record`}
    onCancel={(event) => { event.preventDefault(); if (!pending.current) dismiss(); }}>
    <h2 id={`${id}-title`}>{label}</h2>
    <p id={`${id}-record`}>רשומה: <strong><bdi dir="auto">{recordLabel}</bdi></strong></p>
    {amountAgorot !== undefined ? <p className="confirmation-amount" data-tone={tone}>סכום: <strong><bdi>{new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(amountAgorot / 100)}</bdi></strong></p> : null}
    {description ? <p>{description}</p> : null}
    <p>בדקו את הפרטים לפני אישור הפעולה.</p>
    <ProblemBanner error={error} />
    <div className="dialog-actions">
      <button type="button" ref={cancel} disabled={busy} onClick={dismiss}>ביטול</button>
      <button type="button" className={tone} disabled={busy} onClick={() => void confirm()}>{busy ? 'מבצעים…' : `אישור: ${label}`}</button>
    </div>
  </dialog>;
}
