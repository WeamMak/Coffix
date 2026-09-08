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
  return <section className="editor-panel"><h2>Adjust {stock.sku_code}</h2><p>Current total: {stock.stock_quantity ?? 'Unlimited'} · Reserved: {stock.reserved_quantity} · Available: {stock.available_quantity ?? 'Unlimited'}</p>
    <form onChange={() => setDraft(null)} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setDraft({ quantity: unlimited ? null : Number(data.get('quantity')), expected_quantity: stock.stock_quantity, reason: text(data, 'reason') }); }}><fieldset disabled={save.isPending}>
      <label><input type="checkbox" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} /> Unlimited stock</label>
      {!unlimited ? <FormField label="New total stock" name="quantity" type="number" min={stock.reserved_quantity} max={2147483647} step={1} required defaultValue={stock.stock_quantity ?? stock.reserved_quantity} /> : null}
      <FormField label="Reason" name="reason" required minLength={3} maxLength={500} pattern=".*\S.*\S.*\S.*" />
      <button type="submit">Review correction</button><button type="button" onClick={onClose}>Close adjustment</button>
    </fieldset></form>
    {draft ? <ConfirmAction label="Apply stock correction" recordLabel={stock.sku_code} description={`${stock.stock_quantity ?? 'Unlimited'} → ${draft.quantity ?? 'Unlimited'}. Active reservations remain in place. Reason: ${draft.reason}`} onConfirm={async () => { await save.mutateAsync(draft); }} /> : null}
    {save.isError ? <button onClick={() => void onReload()}>Reload inventory and discard correction</button> : null}
  </section>;
}
