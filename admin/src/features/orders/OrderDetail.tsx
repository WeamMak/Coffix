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
  if (!query.data) return query.isPending ? <p role="status">Loading order…</p> : <ProblemBanner error={query.error} />;
  const order = query.data;
  const refund = order.refund ?? accepted;
  const actions = order.allowed_actions;
  const address = order.address;
  const trackingUrl = order.shipment?.tracking_url;
  return <section><Link to="/orders">Back to orders</Link><h1>{order.order_number}</h1><StatusBadge label={order.state.replaceAll('_', ' ')} />
    <p className="order-total">{money(order.total_agorot)}</p><p>Subtotal {money(order.subtotal_agorot)} · Shipping {money(order.shipping_agorot)}</p>
    <p>Created {dateTime(order.created_at)} · Israel time</p>
    <button disabled={query.isFetching || command.isPending} onClick={() => void query.refetch()}>Refresh order</button>
    <ProblemBanner error={query.error ?? command.error} />
    {refund ? <div role="status" className="outcome"><strong>{refund.state === 'pending' ? 'Refund pending — awaiting provider confirmation.' : refund.state === 'confirmed' ? 'Full refund confirmed.' : 'Refund failed — contact payment operations before taking further action.'}</strong><p>Amount: {money(refund.amount_agorot)}</p></div> : null}
    <div className="page-actions">{actions.includes('process') ? <button disabled={command.isPending} onClick={() => command.mutate('process')}>Start processing</button> : null}
    {actions.includes('deliver') ? <button disabled={command.isPending} onClick={() => command.mutate('deliver')}>Mark delivered</button> : null}</div>
    <div className="detail-grid"><section className="editor-panel"><h2>Delivery address</h2><address dir="auto">{address.recipient_name}<br />{address.street} {address.building}{address.apartment ? `, ${address.apartment}` : ''}<br />{address.city} {address.postal_code}<br /><span dir="ltr">{address.phone_e164}</span></address></section>
    {order.shipment ? <section className="editor-panel"><h2>Shipment tracking</h2><p>{order.shipment.carrier} · {order.shipment.tracking_number}</p>{trackingUrl && /^https?:\/\//i.test(trackingUrl) ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer">Open tracking</a> : null}<p>Shipped: {dateTime(order.shipment.shipped_at)}</p><p>Delivered: {dateTime(order.shipment.delivered_at)}</p></section> : null}</div>
    <DataTable caption="Order items" rows={order.items} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'Product', render: (row) => <span dir="auto">{row.product_name_he}</span> },
      { key: 'sku', label: 'SKU / attributes', render: (row) => <>{row.sku_code}<br />{Object.entries(row.attributes).map(([key, value]) => `${key}: ${value}`).join(', ')}</> },
      { key: 'quantity', label: 'Quantity', render: (row) => row.quantity },
      { key: 'price', label: 'Unit price', render: (row) => money(row.unit_price_agorot) },
      { key: 'total', label: 'Line total', render: (row) => money(row.line_total_agorot) },
    ]} />
    <section className="editor-panel"><h2>Status history</h2><ol>{order.history.map((item, index) => <li key={`${item.created_at}:${index}`}><strong>{item.to_state.replaceAll('_', ' ')}</strong> — {dateTime(item.created_at)} · {item.source}{item.reason ? ` · ${item.reason}` : ''}</li>)}</ol></section>
    {actions.includes('ship') ? <ShipmentForm orderId={order.id} /> : null}
    {actions.includes('cancel') ? <OrderReasonAction order={order} action="cancel" /> : null}
    {actions.includes('refund') && !refund ? <RefundAction order={order} onAccepted={setAccepted} /> : null}
  </section>;
}
