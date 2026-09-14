import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { ProblemBanner } from '../../components/ProblemBanner';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime, label, money, useStaffQuery, type Schema } from '../service/api';

export function Overview() {
  const query = useStaffQuery<Schema['DashboardRead']>('/admin/dashboard', true);
  const recent = useStaffQuery<Schema['OrderQueueRead'][]>('/admin/orders?limit=4&page=1', true);
  const data = query.data;
  return <section><h1>סקירה כללית</h1><ProblemBanner error={query.error} />
    {!data ? query.isPending ? <p role="status">טוענים את הסקירה…</p> : null : <>
      <div className="metric-grid overview-metrics">
        <article className="metric-card" aria-label="הכנסות ממוצרים"><h2>הכנסות ממוצרים</h2><strong><bdi>{money(data.product_revenue_agorot)}</bdi></strong><small>הזמנות ששולמו, בניכוי החזרים שאושרו</small></article>
        <article className="metric-card" aria-label="הזמנות הממתינות לטיפול"><h2>הזמנות הממתינות לטיפול</h2><strong>{data.orders_by_state.paid ?? 0}</strong><small><Link to="/orders?state=paid">מעבר לרשימה המסוננת ←</Link></small></article>
        <article className="metric-card" aria-label="בקשות שירות פתוחות"><h2>בקשות שירות פתוחות</h2><strong>{data.open_services}</strong><small>{data.awaiting_payment_services} ממתינות לתשלום</small></article>
        <article className="metric-card" aria-label="תיאומים להיום"><h2>תיאומים להיום</h2><strong>{data.todays_appointments.length}</strong><small>לפי שעון ישראל</small></article>
      </div>
      <div className="overview-layout"><section className="list-panel no-caption">
        <div className="panel-heading"><div><h2>הזמנות אחרונות</h2><p>לפי מועד העדכון האחרון</p></div><Link className="secondary-link" to="/orders?state=all">כל ההזמנות</Link></div>
        <DataTable caption="הזמנות אחרונות" rows={recent.data ?? []} loading={recent.isPending} error={recent.error} rowKey={(row) => row.id} columns={[
          { key: 'number', label: 'מספר הזמנה', render: (row) => <Link dir="ltr" to={`/orders/${row.id}`}>{row.order_number}</Link> },
          { key: 'total', label: 'סכום', render: (row) => money(row.total_agorot) },
          { key: 'state', label: 'מצב', render: (row) => <StatusBadge label={label(row.state)} /> },
          { key: 'updated', label: 'עודכנה', render: (row) => dateTime(row.updated_at) },
        ]} />
      </section><section className="list-panel attention-panel"><div className="panel-heading"><div><h2>דורש טיפול</h2><p>תשלומים, מלאי ושליחות הממתינים לבדיקה</p></div></div>
        <ul className="attention-list">{[
          ['התראות שלא נשלחו', data.failed_deliveries, '/operations', 'ניסיון חוזר אינו אישור שההודעה נשלחה', 'danger'],
          ['בקשות שירות הממתינות לתשלום', data.awaiting_payment_services, '/service', 'אפשר להמשיך בעבודה לאחר אישור התשלום', 'warning'],
          ['הזמנות הממתינות לתשלום', data.awaiting_payment_orders, '/orders?state=pending_payment', 'התשלום טרם אושר', 'warning'],
          ['מק״טים במלאי נמוך', data.low_stock_skus, '/catalog/inventory', 'בדיקת הכמויות הזמינות בחנות', 'success'],
          ['אירועי רקע שנכשלו', data.failed_outbox_events, '/operations', 'אירועים הדורשים בדיקה', 'danger'],
          ['אירועי רקע הממתינים לטיפול', data.pending_outbox_events, '/operations', 'העיבוד ברקע טרם הסתיים', 'warning'],
        ].map(([title, count, path, detail, tone]) => <li key={title} aria-label={String(title)}><span className="attention-dot" data-tone={tone} /><div><Link to={String(path)}><strong>{count}</strong> {title}</Link><small>{detail}</small></div></li>)}</ul>
      </section></div>
      <div className="list-panel no-caption"><div className="panel-heading"><div><h2>תיאומים להיום</h2><p>השעות מוצגות לפי שעון ישראל</p></div><button onClick={() => void query.refetch()} disabled={query.isFetching}>רענון הסקירה</button></div>
      <DataTable caption="תיאומים להיום" rows={data.todays_appointments} rowKey={(row) => row.id} emptyMessage="אין תיאומים להיום." columns={[
        { key: 'time', label: 'שעון ישראל', render: (row) => `${dateTime(row.start)} – ${dateTime(row.end)}` },
        { key: 'request', label: 'בקשה', render: (row) => <Link dir="ltr" to={`/service/${row.id}`}>{row.reference}</Link> },
        { key: 'technician', label: 'טכנאי', render: (row) => row.technician_name ?? 'טכנאי ללא שם' },
      ]} /></div>
      <details className="state-summary"><summary>סיכום הזמנות ובקשות לפי מצב</summary><div className="detail-grid">{[['הזמנות לפי מצב', data.orders_by_state, '/orders'], ['בקשות שירות לפי מצב', data.service_requests_by_state, '/service']].map(([title, values, path]) => <section className="editor-panel" key={String(title)}><h2>{String(title)}</h2><ul className="queue-counts">{Object.entries(values).map(([state, count]) => <li key={state}><Link to={`${path}?state=${state}`}>{label(state)}</Link><strong>{count}</strong></li>)}</ul></section>)}</div></details>
    </>}
  </section>;
}
