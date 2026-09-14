import { label } from '../../components/labels';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { ProblemBanner } from '../../components/ProblemBanner';
import { StatusBadge } from '../../components/StatusBadge';
import { useWebSession } from '../auth/useWebSession';
import { dateTime, money, useAdminQuery, useCommerceSave, type Schema } from '../catalog/api';
import { OrderReasonAction, RefundAction } from './RefundAction';
import { ShipmentForm } from './ShipmentForm';

export function OrderDetail() {
  const { orderId } = useParams();
  return <OrderRecord key={orderId} orderId={orderId ?? ''} />;
}
function OrderRecord({ orderId }: { orderId: string }) {
  const { client } = useWebSession();
  const query = useAdminQuery<Schema['AdminOrderRead']>(`/admin/orders/${orderId}`, true, true);
  const [accepted, setAccepted] = useState<Schema['RefundRead'] | null>(null);
  const command = useCommerceSave((action: 'process' | 'deliver') => client.api.request(`/admin/orders/${orderId}/${action}`, { method: 'POST' }));
  if (!query.data) return query.isPending ? <p role="status">טוענים את ההזמנה…</p> : <ProblemBanner error={query.error} />;
  const order = query.data;
  const refund = order.refund ?? accepted;
  const actions = order.allowed_actions;
  const address = order.address;
  const trackingUrl = order.shipment?.tracking_url;
  return <section><Link className="back-link" to="/orders">חזרה להזמנות</Link><div className="record-header editor-panel"><div><h1><bdi dir="ltr">{order.order_number}</bdi></h1><StatusBadge label={label(order.state)} /><p className="muted">נוצרה {dateTime(order.created_at)} · שעון ישראל</p></div>
        <div className="page-actions">{actions.includes('process') ? <button className="primary" disabled={command.isPending} onClick={() => command.mutate('process')}>העברה להכנה</button> : null}
    {actions.includes('deliver') ? <button className="primary" disabled={command.isPending} onClick={() => command.mutate('deliver')}>סימון כנמסרה</button> : null}</div><button disabled={query.isFetching || command.isPending} onClick={() => void query.refetch()}>רענון ההזמנה</button>
    {actions.includes('ship') ? <a className="secondary-link" href="#shipment-form">פרטי משלוח</a> : null}
    {actions.includes('refund') && !refund ? <a className="secondary-link" href="#refund-form">החזר מלא</a> : null}
    {actions.includes('cancel') ? <a className="secondary-link" href="#cancel-form">ביטול הזמנה</a> : null}</div>
    <ProblemBanner error={query.error ?? command.error} />
    {refund ? <div role="status" className="outcome"><strong>{refund.state === 'pending' ? 'ההחזר בטיפול — ממתינים לאישור ספק התשלום.' : refund.state === 'confirmed' ? 'ההחזר המלא אושר.' : 'ההחזר נכשל — פנו לאחראי התשלומים לפני ביצוע פעולה נוספת.'}</strong><p>סכום: {money(refund.amount_agorot)}</p></div> : null}

    <div className="record-layout"><div className="record-primary">
    <div className="list-panel"><DataTable caption="פריטי הזמנה" rows={order.items} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'מוצר', render: (row) => <span dir="auto">{row.product_name_he}</span> },
      { key: 'sku', label: 'מק״ט / מאפיינים', render: (row) => <><bdi dir="ltr">{row.sku_code}</bdi><br />{Object.entries(row.attributes).map(([key, value]) => `${key}: ${value}`).join(', ')}</> },
      { key: 'quantity', label: 'כמות', render: (row) => row.quantity },
      { key: 'price', label: 'מחיר ליחידה', render: (row) => money(row.unit_price_agorot) },
      { key: 'total', label: 'סכום לשורה', render: (row) => money(row.line_total_agorot) },
    ]} /><dl className="definition-list order-summary"><div><dt>סכום מוצרים</dt><dd><bdi>{money(order.subtotal_agorot)}</bdi></dd></div><div><dt>דמי משלוח שנשמרו בהזמנה</dt><dd><bdi>{money(order.shipping_agorot)}</bdi></dd></div><div className="grand-total"><dt>סה״כ לתשלום</dt><dd><bdi>{money(order.total_agorot)}</bdi></dd></div></dl></div>
    <section className="editor-panel"><h2>היסטוריית מצבים</h2><ol className="activity-history">{order.history.map((item, index) => <li key={`${item.created_at}:${index}`}><strong>{label(item.to_state)}</strong> — {dateTime(item.created_at)} · {label(item.source)}{item.reason ? ` · ${item.reason}` : ''}</li>)}</ol></section>
    </div><div className="record-support">
    <section className="editor-panel"><h2>תשלום</h2><dl className="definition-list"><div><dt>מצב ההזמנה</dt><dd>{label(order.state)}</dd></div><div><dt>סכום ההזמנה</dt><dd><bdi>{money(order.total_agorot)}</bdi></dd></div></dl></section>
    <section className="editor-panel"><h2>כתובת משלוח</h2><address dir="auto">{address.recipient_name}<br />{address.street} {address.building}{address.apartment ? `, ${address.apartment}` : ''}<br />{address.city} {address.postal_code}<br /><bdi dir="ltr">{address.phone_e164}</bdi></address></section>
    {order.shipment ? <section className="editor-panel"><h2>מעקב משלוח</h2><p>{order.shipment.carrier} · <bdi dir="ltr">{order.shipment.tracking_number}</bdi></p>{trackingUrl && /^https?:\/\//i.test(trackingUrl) ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer">פתיחת מעקב</a> : null}<p>נשלחה: {dateTime(order.shipment.shipped_at)}</p><p>נמסרה: {dateTime(order.shipment.delivered_at)}</p></section> : null}
    {actions.includes('ship') ? <ShipmentForm orderId={order.id} /> : null}
    {actions.includes('cancel') ? <OrderReasonAction order={order} action="cancel" /> : null}
    {actions.includes('refund') && !refund ? <RefundAction order={order} onAccepted={setAccepted} /> : null}
    </div></div>
  </section>;
}
