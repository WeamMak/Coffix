import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { ProblemBanner } from '../../components/ProblemBanner';
import { dateTime, label, money, useStaffQuery, type Schema } from '../service/api';

export function Overview() {
  const query = useStaffQuery<Schema['DashboardRead']>('/admin/dashboard', true);
  const data = query.data;
  return <section><p className="eyebrow">Daily operations</p><h1>Overview</h1><p>Current totals across the shop. Appointments use Israel time.</p>
    <button onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh overview</button><ProblemBanner error={query.error} />
    {!data ? query.isPending ? <p role="status">Loading overview…</p> : null : <>
      <div className="metric-grid">{[
        ['Product revenue', money(data.product_revenue_agorot), '/orders'], ['Open services', data.open_services, '/service'],
        ['Orders awaiting payment', data.awaiting_payment_orders, '/orders?state=pending_payment'], ['Services awaiting payment', data.awaiting_payment_services, '/service'],
        ['Low stock SKUs', data.low_stock_skus, '/catalog/inventory'], ['Failed notifications', data.failed_deliveries, '/operations'],
        ['Pending background events', data.pending_outbox_events, '/operations'],
        ['Failed background events', data.failed_outbox_events, '/operations'],
      ].map(([title, value, to]) => <article key={title} className="metric-card" aria-label={String(title)}><h2><Link to={String(to)}>{title}</Link></h2><strong>{value}</strong></article>)}</div>
      <p className="muted">Product revenue includes paid orders and excludes confirmed full refunds.</p>
      <DataTable caption="Today's appointments" rows={data.todays_appointments} rowKey={(row) => row.id} emptyMessage="No appointments today." columns={[
        { key: 'request', label: 'Request', render: (row) => <Link to={`/service/${row.id}`}>{row.reference}</Link> },
        { key: 'technician', label: 'Technician', render: (row) => row.technician_name ?? 'Unnamed technician' },
        { key: 'time', label: 'Israel time', render: (row) => `${dateTime(row.start)} – ${dateTime(row.end)}` },
      ]} />
      <div className="detail-grid">{[['Orders by state', data.orders_by_state, '/orders'], ['Services by state', data.service_requests_by_state, '/service']].map(([title, values, path]) => <section className="editor-panel" key={String(title)}><h2>{String(title)}</h2><ul className="queue-counts">{Object.entries(values).map(([state, count]) => <li key={state}><Link to={`${path}?state=${state}`}>{label(state)}</Link><strong>{count}</strong></li>)}</ul></section>)}</div>
    </>}
  </section>;
}
