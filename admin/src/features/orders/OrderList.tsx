import { label } from '../../components/labels';
import { Link } from 'react-router-dom';
import { ListSearch, Pagination, useListFilters } from '../../components/CommerceControls';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime, money, useAdminQuery, type Schema } from '../catalog/api';

export function OrderList() {
  const filters = useListFilters();
  const state = filters.params.get('state') ?? 'paid';
  const params = new URLSearchParams(filters.query); if (state !== 'all') params.set('state', state); else params.delete('state');
  const query = useAdminQuery<Schema['OrderQueueRead'][]>(`/admin/orders?${params}`);
  return <section><h1>הזמנות</h1><div className="list-panel no-caption">
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)} placeholder="חיפוש לפי מספר הזמנה" actions={<button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>רענון ההזמנות</button>}>
      <label>מצב הזמנה<select aria-label="מצב הזמנה" value={state} onChange={(event) => filters.change('state', event.target.value)}>{['all', 'paid', 'processing', 'shipped', 'delivered', 'pending_payment', 'cancelled', 'payment_expired', 'refunded'].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
    </ListSearch>
    <DataTable caption="תור הזמנות" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'number', label: 'הזמנה', render: (row) => <Link dir="ltr" to={`/orders/${row.id}`}>{row.order_number}</Link> },
      { key: 'state', label: 'מצב', render: (row) => <StatusBadge label={label(row.state)} /> },
      { key: 'total', label: 'סכום כולל', render: (row) => money(row.total_agorot) },
      { key: 'created', label: 'נוצרה (שעון ישראל)', render: (row) => dateTime(row.created_at) },
    ]} /><Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
  </div></section>;
}
