import { useEffect, useId, useRef, useState } from 'react';
import { ProblemBanner } from './ProblemBanner';

type Props = {
  label: string;
  recordLabel: string;
  amountAgorot?: number;
  description?: string;
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

function ConfirmationDialog({ label, recordLabel, amountAgorot, description, onConfirm, close }: Props & { close: () => void }) {
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

  async function confirm() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await onConfirm(); close(); }
    catch (error) { setError(error); }
    finally { pending.current = false; setBusy(false); }
  }

  return <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-record`}
    onCancel={(event) => { event.preventDefault(); if (!pending.current) close(); }}>
    <h2 id={`${id}-title`}>{label}</h2>
    <p id={`${id}-record`}>Record: <strong>{recordLabel}</strong></p>
    {amountAgorot !== undefined ? <p>Amount: <strong>{new Intl.NumberFormat('en-IL', { style: 'currency', currency: 'ILS' }).format(amountAgorot / 100)}</strong></p> : null}
    {description ? <p>{description}</p> : null}
    <p>Review the details before confirming this action.</p>
    <ProblemBanner error={error} />
    <div className="dialog-actions">
      <button type="button" ref={cancel} disabled={busy} onClick={close}>Cancel</button>
      <button type="button" className="danger" disabled={busy} onClick={() => void confirm()}>{busy ? 'Working…' : `Confirm ${label.toLowerCase()}`}</button>
    </div>
  </dialog>;
}
