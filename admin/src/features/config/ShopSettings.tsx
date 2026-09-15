import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { money, useStaffQuery, useStaffSave, type Schema } from '../service/api';
import { ConfigurationNav } from './ConfigurationNav';

type Shop = Schema['ShopSettingsRead'];
const labels = { shipping_fee_agorot: 'דמי משלוח', shop_address: 'כתובת החנות', phone: 'טלפון', whatsapp: 'WhatsApp', email: 'דואר אלקטרוני', opening_hours: 'שעות פעילות' };
const snapshotNotice = 'השינויים יחולו על הזמנות ובקשות הבאה לחנות חדשות. הזמנות ובקשות קיימות שומרות על המחירים והכתובות שנרשמו בהן. שעות הפעילות אינן משנות חלונות שירות או זמני תגובה.';
function display(shop: Shop, field: keyof typeof labels) {
  if (field === 'shipping_fee_agorot') return money(shop[field]);
  if (field === 'shop_address') return [shop.shop_address.street, shop.shop_address.building, shop.shop_address.city, shop.shop_address.postal_code].filter(Boolean).join(', ') || 'טרם הוגדר';
  return shop[field] || 'טרם הוגדר';
}

export function ShopSettings() {
  const query = useStaffQuery<Shop>('/admin/shop-settings');
  return <section><h1>הגדרות החנות</h1><ConfigurationNav /><ProblemBanner error={query.error} />
    {query.data ? <ShopEditor initial={query.data} reload={async () => (await query.refetch({ throwOnError: true })).data!} /> : query.isPending ? <p role="status">טוענים את הגדרות החנות…</p> : <button onClick={() => void query.refetch()}>ניסיון נוסף</button>}
  </section>;
}

function ShopEditor({ initial, reload }: { initial: Shop; reload: () => Promise<Shop> }) {
  const { client } = useWebSession();
  const [baseline, setBaseline] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [fee, setFee] = useState((initial.shipping_fee_agorot / 100).toFixed(2));
  const [review, setReview] = useState<Schema['ShopSettingsUpdate'] | null>(null);
  const [message, setMessage] = useState('');
  const [reloadError, setReloadError] = useState<unknown>(null);
  const [reloading, setReloading] = useState(false);
  const save = useStaffSave(async (body: Schema['ShopSettingsUpdate']) => {
    const saved = await client.api.request<Shop>('/admin/shop-settings', { method: 'PUT', body });
    setBaseline(saved); setDraft(saved); setFee((saved.shipping_fee_agorot / 100).toFixed(2));
    setReview(null); setMessage('הגדרות החנות נשמרו.');
  });
  function edit(next: Shop) { setDraft(next); setReview(null); setMessage(''); }
  async function discard() {
    setReloadError(null); setReloading(true);
    try { const fresh = await reload(); setBaseline(fresh); setDraft(fresh); setFee((fresh.shipping_fee_agorot / 100).toFixed(2)); setReview(null); save.reset(); setMessage(''); }
    catch (error) { setReloadError(error); }
    finally { setReloading(false); }
  }
  const incomplete = !draft.shop_address.street?.trim() || !draft.shop_address.building?.trim() || !draft.shop_address.city?.trim();
  return <div className="record-layout"><div>
    <ProblemBanner error={reloadError} />
    {message ? <p role="status">{message}</p> : null}
    <form onSubmit={event => {
      event.preventDefault();
      const parts = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(fee.trim());
      if (!parts) { setMessage('יש להזין מחיר בשקלים עם עד שתי ספרות אחרי הנקודה.'); return; }
      const agorot = Number(parts[1]) * 100 + Number((parts[2] ?? '').padEnd(2, '0'));
      if (agorot > 2147483647) { setMessage('המחיר גבוה מהסכום המותר.'); return; }
      setReview({ ...draft, shipping_fee_agorot: agorot, shop_address: { ...draft.shop_address, street: draft.shop_address.street!.trim(), building: draft.shop_address.building!.trim(), city: draft.shop_address.city!.trim() } });
    }}><fieldset disabled={save.isPending || reloading}>
      <section className="editor-panel"><h2>משלוח מוצרים</h2>
        <FormField label="דמי משלוח בשקלים" inputMode="decimal" dir="ltr" required pattern="[0-9]{1,8}(\.[0-9]{1,2})?" value={fee} onChange={event => { setFee(event.target.value); setReview(null); setMessage(''); }} hint="מחיר קבוע להזמנות חדשות. הזינו 0 למשלוח חינם." />
      </section>
      <section className="editor-panel"><h2>כתובת החנות</h2>
        {incomplete ? <p className="subtle-notice">הכתובת אינה מלאה. השלימו רחוב, מספר בית ועיר לפני שמירה.</p> : null}
        {(['street', 'building', 'city', 'postal_code'] as const).map(field => <FormField key={field} label={{ street: 'רחוב', building: 'מספר בית', city: 'עיר', postal_code: 'מיקוד (לא חובה)' }[field]} required={field !== 'postal_code'} maxLength={{ street: 120, building: 30, city: 80, postal_code: 7 }[field]} pattern={field === 'postal_code' ? '[0-9]{5}([0-9]{2})?' : '.*\\S.*'} value={draft.shop_address[field] ?? ''} onChange={event => edit({ ...draft, shop_address: { ...draft.shop_address, [field]: event.target.value || null } })} />)}
        <p>מדינה: ישראל</p>
      </section>
      <section className="editor-panel"><h2>פרטי יצירת קשר</h2><p>הפרטים מוצגים ללקוחות באפליקציה. שדה ריק מסתיר את פעולת יצירת הקשר.</p>
        {(['phone', 'whatsapp', 'email'] as const).map(field => <FormField key={field} label={labels[field]} type={field === 'email' ? 'email' : 'tel'} pattern={field === 'email' ? undefined : '\\+[1-9][0-9]{7,14}'} hint={field === 'email' ? undefined : 'בפורמט בינלאומי, לדוגמה ‎+97231234567'} maxLength={field === 'email' ? 254 : 16} value={draft[field] ?? ''} onChange={event => edit({ ...draft, [field]: event.target.value || null })} />)}
      </section>
      <section className="editor-panel"><h2>שעות פעילות</h2><label htmlFor="shop-hours">שעות פעילות ללקוחות</label><textarea id="shop-hours" dir="auto" rows={5} maxLength={1000} value={draft.opening_hours ?? ''} onChange={event => edit({ ...draft, opening_hours: event.target.value || null })} /><p className="muted">שעות מקומיות בישראל; אפשר לציין ימים סגורים והערות לחגים.</p></section>
      <button type="submit">סקירת השינויים</button>
    </fieldset></form>
    <button type="button" disabled={save.isPending || reloading} onClick={() => void discard()}>טעינה מחדש וביטול הטיוטה</button>
    {review ? <section className="editor-panel"><h2>סקירת השינויים</h2><DataTable caption="השוואת ערכים" rows={(Object.keys(labels) as (keyof typeof labels)[]).filter(field => JSON.stringify(baseline[field]) !== JSON.stringify(review[field]))} rowKey={field => field} emptyMessage="לא שונו ערכים." columns={[
      { key: 'field', label: 'שדה', render: field => labels[field] },
      { key: 'before', label: 'לפני', render: field => <bdi style={{ whiteSpace: 'pre-wrap' }}>{display(baseline, field)}</bdi> },
      { key: 'after', label: 'אחרי', render: field => <bdi style={{ whiteSpace: 'pre-wrap' }}>{display(review, field)}</bdi> },
    ]} /><p>{snapshotNotice}</p><ConfirmAction label="שמירת הגדרות החנות" recordLabel="הגדרות החנות" amountAgorot={review.shipping_fee_agorot} description={snapshotNotice} onConfirm={async () => { await save.mutateAsync(review); }} /></section> : null}
  </div><aside><section className="editor-panel"><h2>תצוגה מקדימה: צרו קשר</h2><p>כתובת החנות</p><address dir="auto">{display(draft, 'shop_address')}</address>{(['phone', 'whatsapp', 'email'] as const).map(field => draft[field] ? <p key={field}>{labels[field]}: <bdi dir="ltr">{draft[field]}</bdi></p> : null)}<h3>שעות פעילות</h3><p dir="auto" style={{ whiteSpace: 'pre-wrap' }}>{draft.opening_hours || 'שעות הפעילות יעודכנו בקרוב.'}</p></section><section className="editor-panel"><h2>השפעת השינויים</h2><p>{snapshotNotice}</p><Link to="/configuration/intake">עריכת חלונות מועדפים וזמן תגובה</Link></section></aside></div>;
}
