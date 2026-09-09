import { useState } from 'react';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { useWebSession } from '../auth/useWebSession';
import { money, text, useStaffSave, type Schema } from './api';

export function QuoteForm({ service, diagnostic = false }: { service: Schema['StaffServiceRequestRead']; diagnostic?: boolean }) {
  const { client } = useWebSession();
  const [draft, setDraft] = useState<{ amount_agorot: number; explanation?: string } | null>(null);
  const command = useStaffSave((body: NonNullable<typeof draft>) => client.api.request(`/admin/service-requests/${service.id}/${diagnostic ? 'diagnostic-fee' : 'quote'}`, { method: 'POST', body }));
  // Preview only. The API applies the immutable urgency snapshot and returns the charged amount.
  const total = draft ? Math.floor((draft.amount_agorot * (100 + service.urgency_surcharge_percent) + 50) / 100) : 0;
  return <section className="editor-panel"><h2>{diagnostic ? 'Diagnostic offer' : 'Additional repair quote'}</h2>
    <p>Snapshotted urgency: <span dir="auto">{service.urgency_name_he}</span> · {service.urgency_surcharge_percent}% surcharge.</p>
    <form onChange={() => setDraft(null)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      setDraft({ amount_agorot: Number(text(data, 'amount')), ...(diagnostic ? {} : { explanation: text(data, 'explanation') }) });
    }}>
      <fieldset disabled={command.isPending}>
        <FormField label={diagnostic ? 'Base diagnostic fee (agorot)' : 'Base additional cost (agorot)'} name="amount" type="number" min={1} max={100000000} step={1} required />
        {!diagnostic ? <label className="form-field">Customer-visible explanation<textarea name="explanation" required maxLength={4000} /></label> : null}
        <button type="submit">{diagnostic ? 'Review diagnostic fee' : 'Review additional quote'}</button>
      </fieldset>
    </form>
    {draft ? <div className="outcome"><p>Base {money(draft.amount_agorot)} · Total including urgency {money(total)}</p>
      <ConfirmAction label={diagnostic ? 'Send diagnostic offer' : 'Send additional quote'} recordLabel={service.reference} amountAgorot={total}
        description={diagnostic ? 'The customer must pay this non-refundable diagnostic fee before an appointment can be confirmed.' : `${draft.explanation} — Repair waits for customer acceptance and payment. Service payments are non-refundable.`}
        onConfirm={async () => { await command.mutateAsync(draft); setDraft(null); }} />
    </div> : null}
  </section>;
}
