import { useState } from 'react';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { useWebSession } from '../auth/useWebSession';
import { text, useCommerceSave, type Schema } from '../catalog/api';

export function StockAdjustment({ stock, onClose, onReload }: { stock: Schema['InventoryRead']; onClose: () => void; onReload: () => Promise<void> }) {
  const { client } = useWebSession();
  const [unlimited, setUnlimited] = useState(stock.stock_quantity === null);
  const [draft, setDraft] = useState<Schema['StockCorrection'] | null>(null);
  const save = useCommerceSave((body: Schema['StockCorrection']) => client.api.request(`/admin/inventory/${stock.id}/corrections`, { method: 'POST', body }), onClose);
  return <section className="editor-panel"><h2>עדכון <bdi dir="ltr">{stock.sku_code}</bdi></h2><p>כמות כוללת כעת: {stock.stock_quantity ?? 'ללא הגבלה'}  · שמור: {stock.reserved_quantity}  · זמין: {stock.available_quantity ?? 'ללא הגבלה'}</p>
    <form onChange={() => setDraft(null)} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setDraft({ quantity: unlimited ? null : Number(data.get('quantity')), expected_quantity: stock.stock_quantity, reason: text(data, 'reason') }); }}><fieldset disabled={save.isPending}>
      <label><input type="checkbox" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} />  מלאי ללא הגבלה</label>
      {!unlimited ? <FormField label="כמות כוללת חדשה" name="quantity" type="number" min={stock.reserved_quantity} max={2147483647} step={1} required defaultValue={stock.stock_quantity ?? stock.reserved_quantity} /> : null}
      <FormField label="סיבה" name="reason" required minLength={3} maxLength={500} pattern=".*\S.*\S.*\S.*" />
      <button type="submit">סקירת עדכון המלאי</button><button type="button" onClick={onClose}>סגירת עדכון המלאי</button>
    </fieldset></form>
    {draft ? <ConfirmAction label="החלת עדכון מלאי" recordLabel={stock.sku_code} description={`${stock.stock_quantity ?? 'ללא הגבלה'} → ${draft.quantity ?? 'ללא הגבלה'}. המלאי השמור בעגלות נשמר. סיבה: ${draft.reason}`} onConfirm={async () => { await save.mutateAsync(draft); }} /> : null}
    {save.isError ? <button onClick={() => void onReload()}>טעינת המלאי מחדש וביטול העדכון</button> : null}
  </section>;
}
