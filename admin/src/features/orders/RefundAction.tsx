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
  const label = action === 'refund' ? 'Refund order' : 'Cancel order';
  const save = useCommerceSave(async (body: Schema['ConfirmedReasonCommand']) => {
    setAttempted(true);
    if (action === 'refund') {
      const result = await client.api.request<Schema['RefundRead']>(`/admin/orders/${order.id}/refund`, { method: 'POST', body, headers: { 'Idempotency-Key': key } });
      onAccepted?.(result);
    } else await client.api.request(`/admin/orders/${order.id}/cancel`, { method: 'POST', body });
  });
  return <section className="editor-panel"><h2>{action === 'refund' ? 'Full refund' : 'Cancel unpaid order'}</h2>
    <p>{action === 'refund' ? 'Refund the entire order total, including shipping. Final status follows provider confirmation.' : 'Cancel this unpaid order and release its stock reservations.'}</p>
    <form onChange={() => setDraft(null)} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setDraft({ reason: text(data, 'reason'), confirm_order_number: text(data, 'confirm_order_number') }); }}><fieldset disabled={save.isPending || attempted}>
      <FormField label="Reason" name="reason" required minLength={3} maxLength={1000} pattern=".*\S.*\S.*\S.*" />
      <FormField label="Confirm order number" name="confirm_order_number" required maxLength={32} hint={`Enter ${order.order_number}`} onChange={(event) => event.currentTarget.setCustomValidity(event.currentTarget.value.trim() === order.order_number ? '' : 'Enter the exact order number.')} />
      <button type="submit">{action === 'refund' ? 'Review full refund' : 'Review cancellation'}</button>
    </fieldset></form>
    {draft ? <ConfirmAction label={label} recordLabel={order.order_number} amountAgorot={order.total_agorot} description={`${action === 'refund' ? 'Request a full refund; the order remains unchanged until the provider confirms.' : 'Cancel the unpaid order and release reservations. No payment will be refunded.'} Reason: ${draft.reason}`} onConfirm={async () => { await save.mutateAsync(draft); }} /> : null}
    {save.isError ? <p>Refresh the order to check its latest outcome. You can retry the same confirmation.</p> : null}
  </section>;
}
