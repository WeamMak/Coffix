import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { optionalText, text, useCommerceSave, type Schema } from '../catalog/api';

export function ShipmentForm({ orderId }: { orderId: string }) {
  const { client } = useWebSession();
  const save = useCommerceSave((body: Schema['ShipOrderCommand']) => client.api.request(`/admin/orders/${orderId}/ship`, { method: 'POST', body }));
  return <form id="shipment-form" className="editor-panel" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); save.mutate({ carrier: text(data, 'carrier'), tracking_number: text(data, 'tracking_number'), tracking_url: optionalText(data, 'tracking_url') }); }}>
    <h2>משלוח</h2><fieldset disabled={save.isPending}>
      <FormField label="חברת משלוח" name="carrier" required pattern=".*\S.*" maxLength={120} />
      <FormField label="מספר מעקב" name="tracking_number" required pattern=".*\S.*" maxLength={160} />
      <FormField label="קישור מעקב" name="tracking_url" type="url" pattern="https?://.+" maxLength={2048} hint="קישור מלא שמתחיל ב־HTTP או HTTPS (רשות)." />
      <button type="submit">{save.isPending ? 'שומרים משלוח…' : 'שמירת המשלוח וסימון כנשלחה'}</button>
    </fieldset><ProblemBanner error={save.error} />
  </form>;
}
