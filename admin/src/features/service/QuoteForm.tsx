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
  return <section className="editor-panel"><h2>{diagnostic ? 'הצעת אבחון' : 'הצעת תיקון נוספת'}</h2>
    <p>דחיפות שנשמרה בבקשה: <span dir="auto">{service.urgency_name_he}</span> · {service.urgency_surcharge_percent}% תוספת.</p>
    <form onChange={() => setDraft(null)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      setDraft({ amount_agorot: Number(text(data, 'amount')), ...(diagnostic ? {} : { explanation: text(data, 'explanation') }) });
    }}>
      <fieldset disabled={command.isPending}>
        <FormField label={diagnostic ? 'דמי אבחון בסיסיים באגורות' : 'עלות נוספת בסיסית באגורות'} name="amount" type="number" min={1} max={100000000} step={1} required />
        {!diagnostic ? <label className="form-field">הסבר גלוי ללקוח<textarea name="explanation" required maxLength={4000} /></label> : null}
        <button type="submit">{diagnostic ? 'סקירת דמי אבחון' : 'סקירת הצעה נוספת'}</button>
      </fieldset>
    </form>
    {draft ? <div className="outcome"><p>סכום בסיס {money(draft.amount_agorot)}  · סכום כולל תוספת דחיפות {money(total)}</p>
      <ConfirmAction label={diagnostic ? 'שליחת הצעת אבחון' : 'שליחת הצעה נוספת'} recordLabel={service.reference} amountAgorot={total}
        description={diagnostic ? 'על הלקוח לשלם את דמי האבחון לפני אישור מועד. תשלומי השירות אינם ניתנים להחזר.' : `${draft.explanation} — התיקון ממתין לאישור הלקוח ולתשלום. תשלומי שירות אינם ניתנים להחזר.`}
        onConfirm={async () => { await command.mutateAsync(draft); setDraft(null); }} />
    </div> : null}
  </section>;
}
