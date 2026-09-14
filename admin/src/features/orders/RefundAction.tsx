import { useState } from 'react';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { useWebSession } from '../auth/useWebSession';
import { text, useCommerceSave, type Schema } from '../catalog/api';

type Order = Schema['AdminOrderRead'];
export function RefundAction({ order, onAccepted }: { order: Order; onAccepted: (refund: Schema['RefundRead']) => void }) {
  return <OrderReasonAction order={order} action="refund" onAccepted={onAccepted} />;
}
export function OrderReasonAction({ order, action, onAccepted }: { order: Order; action: 'refund' | 'cancel'; onAccepted?: (refund: Schema['RefundRead']) => void }) {
  const { client } = useWebSession();
  const [draft, setDraft] = useState<Schema['ConfirmedReasonCommand'] | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const [attempted, setAttempted] = useState(false);
  const label = action === 'refund' ? 'החזר הזמנה' : 'ביטול הזמנה';
  const save = useCommerceSave(async (body: Schema['ConfirmedReasonCommand']) => {
    setAttempted(true);
    if (action === 'refund') {
      const result = await client.api.request<Schema['RefundRead']>(`/admin/orders/${order.id}/refund`, { method: 'POST', body, headers: { 'Idempotency-Key': key } });
      onAccepted?.(result);
    } else await client.api.request(`/admin/orders/${order.id}/cancel`, { method: 'POST', body });
  });
  return <section id={`${action}-form`} className="editor-panel"><h2>{action === 'refund' ? 'החזר מלא' : 'ביטול הזמנה שלא שולמה'}</h2>
    <p>{action === 'refund' ? 'החזר מלוא סכום ההזמנה, כולל דמי המשלוח. המצב הסופי נקבע לאחר אישור ספק התשלום.' : 'ביטול ההזמנה שלא שולמה ושחרור המלאי השמור עבורה.'}</p>
    <form onChange={() => setDraft(null)} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setDraft({ reason: text(data, 'reason'), confirm_order_number: text(data, 'confirm_order_number') }); }}><fieldset disabled={save.isPending || attempted}>
      <FormField label="סיבה" name="reason" required minLength={3} maxLength={1000} pattern=".*\S.*\S.*\S.*" />
      <FormField label="מספר הזמנה לאישור" name="confirm_order_number" required maxLength={32} hint={`הזינו ${order.order_number}`} onChange={(event) => event.currentTarget.setCustomValidity(event.currentTarget.value.trim() === order.order_number ? '' : 'יש להזין את מספר ההזמנה המדויק.')} />
      <button type="submit">{action === 'refund' ? 'סקירת החזר מלא' : 'סקירת ביטול'}</button>
    </fieldset></form>
    {draft ? <ConfirmAction tone="danger" label={label} recordLabel={order.order_number} amountAgorot={order.total_agorot} description={`${action === 'refund' ? 'בקשת החזר מלא; מצב ההזמנה אינו משתנה עד לאישור הספק.' : 'ביטול ההזמנה שלא שולמה ושחרור המלאי השמור. לא יבוצע החזר כספי.'} סיבה: ${draft.reason}`} onConfirm={async () => { await save.mutateAsync(draft); }} /> : null}
    {save.isError ? <p>רעננו את ההזמנה כדי לבדוק את התוצאה העדכנית. ניתן לנסות שוב את אותו האישור.</p> : null}
  </section>;
}
