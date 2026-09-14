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
  return <section className="editor-panel"><h2>{sku ? `עריכת ${sku.sku_code}` : 'מק״ט חדש'}</h2><form onChange={() => setDraft(null)} onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); let attributes: unknown;
    try { attributes = JSON.parse(text(data, 'attributes')); } catch { attributes = null; }
    if (!attributes || Array.isArray(attributes) || typeof attributes !== 'object' || Object.values(attributes).some((value) => typeof value !== 'string')) { setValidation('המאפיינים חייבים להיות אובייקט JSON עם ערכי טקסט.'); return; }
    setValidation('');
    setDraft({ sku_code: text(data, 'sku_code'), attributes: attributes as Record<string, string>, price_agorot: Number(data.get('price_agorot')), currency: 'ILS', is_active: data.has('is_active'), machine_model_id: optionalText(data, 'machine_model_id'), ...(sku ? { version: sku.version } : { stock_quantity: unlimited ? null : Number(data.get('stock_quantity')) }) });
  }}><fieldset disabled={save.isPending}>
    <FormField label="קוד מק״ט" name="sku_code" required pattern=".*\S.*" maxLength={80} defaultValue={sku?.sku_code} />
    <FormField label="מחיר באגורות" name="price_agorot" type="number" required min={0} max={2147483647} step={1} defaultValue={sku?.price_agorot ?? 0} hint="100 אגורות = שקל אחד. המחירים בשקלים חדשים." />
    <label className="form-field">מאפיינים (JSON)<textarea dir="ltr" aria-label="מאפיינים (JSON)" name="attributes" required defaultValue={JSON.stringify(sku?.attributes ?? {}, null, 2)} /></label>
    <label className="form-field">דגם מכונה<select aria-label="דגם מכונה" name="machine_model_id" value={modelId} onChange={(event) => setModelId(event.target.value)}><option value="">ללא דגם מכונה מקושר</option>{modelId && !models.data?.some((model) => model.id === modelId) ? <option value={modelId}>דגם המכונה הנוכחי</option> : null}{models.data?.map((model) => <option key={model.id} value={model.id}>{model.manufacturer} {model.model_name}</option>)}</select></label><ProblemBanner error={models.error} />
    <label><input type="checkbox" name="is_active" defaultChecked={sku?.is_active ?? true} />  מק״ט פעיל</label>
    {!sku ? <><label><input type="checkbox" checked={unlimited} onChange={(event) => setUnlimited(event.target.checked)} />  מלאי ללא הגבלה</label>{!unlimited ? <FormField label="מלאי התחלתי" name="stock_quantity" type="number" min={0} max={2147483647} step={1} required defaultValue={0} /> : null}</> : <p>לעדכון הכמות עברו למלאי. הכמות הנוכחית: {sku.stock_quantity ?? 'ללא הגבלה'}.</p>}
    {validation ? <p role="alert">{validation}</p> : null}
    <button type="submit">שמירת מק״ט</button><button type="button" onClick={onClose}>סגירת עורך המק״ט</button>
  </fieldset></form>
  {draft ? <ConfirmAction label="החלת שינויים במק״ט" recordLabel={draft.sku_code ?? sku?.sku_code ?? ''} amountAgorot={draft.price_agorot ?? 0} description="שמירת המק״ט ומחיר המכירה שלו. רכישות חדשות ישתמשו במחיר ובמצב הפעילות שנשמרו." onConfirm={async () => { await save.mutateAsync(draft); }} /> : null}
  {save.isError ? <button onClick={() => void onReload()}>טעינת המק״ט מחדש וביטול השינויים</button> : null}
  </section>;
}
