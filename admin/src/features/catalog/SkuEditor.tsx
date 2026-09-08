import { useState } from 'react';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { optionalText, text, useAdminQuery, useCommerceSave, type Schema } from './api';

type Body = Schema['SkuCreate'] | Schema['AdminSkuUpdate'];
export function SkuEditor({ productId, sku, onClose, onReload }: { productId: string; sku?: Schema['AdminSkuRead']; onClose: () => void; onReload: () => Promise<void> }) {
  const { client } = useWebSession();
  const models = useAdminQuery<Schema['MachineModelRead'][]>('/admin/machine-models');
  const [unlimited, setUnlimited] = useState(true);
  const [modelId, setModelId] = useState(sku?.machine_model_id ?? '');
  const [validation, setValidation] = useState('');
  const [draft, setDraft] = useState<Body | null>(null);
  const save = useCommerceSave((body: Body) => client.api.request(sku ? `/admin/skus/${sku.id}` : `/admin/products/${productId}/skus`, { method: sku ? 'PATCH' : 'POST', body }), onClose);
  return <section className="editor-panel"><h2>{sku ? `Edit ${sku.sku_code}` : 'New SKU'}</h2><form onChange={() => setDraft(null)} onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); let attributes: unknown;
    try { attributes = JSON.parse(text(data, 'attributes')); } catch { attributes = null; }
    if (!attributes || Array.isArray(attributes) || typeof attributes !== 'object' || Object.values(attributes).some((value) => typeof value !== 'string')) { setValidation('Attributes must be a JSON object with text values.'); return; }
    setValidation('');
    setDraft({ sku_code: text(data, 'sku_code'), attributes: attributes as Record<string, string>, price_agorot: Number(data.get('price_agorot')), currency: 'ILS', is_active: data.has('is_active'), machine_model_id: optionalText(data, 'machine_model_id'), ...(sku ? { version: sku.version } : { stock_quantity: unlimited ? null : Number(data.get('stock_quantity')) }) });
  }}><fieldset disabled={save.isPending}>
    <FormField label="SKU code" name="sku_code" required pattern=".*\S.*" maxLength={80} defaultValue={sku?.sku_code} />
    <FormField label="Price (agorot)" name="price_agorot" type="number" required min={0} max={2147483647} step={1} defaultValue={sku?.price_agorot ?? 0} hint="100 agorot = ₪1.00. Prices are in ILS." />
    <label className="form-field">Attributes (JSON)<textarea aria-label="Attributes (JSON)" name="attributes" required defaultValue={JSON.stringify(sku?.attributes ?? {}, null, 2)} /></label>
    <label className="form-field">Machine model<select aria-label="Machine model" name="machine_model_id" value={modelId} onChange={(event) => setModelId(event.target.value)}><option value="">No linked machine model</option>{modelId && !models.data?.some((model) => model.id === modelId) ? <option value={modelId}>Current machine model</option> : null}{models.data?.map((model) => <option key={model.id} value={model.id}>{model.manufacturer} {model.model_name}</option>)}</select></label><ProblemBanner error={models.error} />
    <label><input type="checkbox" name="is_active" defaultChecked={sku?.is_active ?? true} /> Active SKU</label>
    {!sku ? <><label><input type="checkbox" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} /> Unlimited stock</label>{!unlimited ? <FormField label="Initial stock" name="stock_quantity" type="number" min={0} max={2147483647} step={1} required defaultValue={0} /> : null}</> : <p>Use Inventory for stock corrections. Current stock: {sku.stock_quantity ?? 'Unlimited'}.</p>}
    {validation ? <p role="alert">{validation}</p> : null}
    <button type="submit">Save SKU</button><button type="button" onClick={onClose}>Close SKU editor</button>
  </fieldset></form>
  {draft ? <ConfirmAction label="Apply SKU changes" recordLabel={draft.sku_code ?? sku?.sku_code ?? ''} amountAgorot={draft.price_agorot ?? 0} description="Save this SKU and its selling price. New purchases use the saved price and visibility." onConfirm={async () => { await save.mutateAsync(draft); }} /> : null}
  {save.isError ? <button onClick={() => void onReload()}>Reload SKU and discard edits</button> : null}
  </section>;
}
