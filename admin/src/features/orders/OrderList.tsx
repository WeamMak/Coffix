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
  return <section><h1>Orders</h1><p>Review paid orders, prepare shipments and track fulfillment.</p>
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)}>
      <label>Order state<select aria-label="Order state" value={state} onChange={(event) => filters.change('state', event.target.value)}>{['all', 'paid', 'processing', 'shipped', 'delivered', 'pending_payment', 'cancelled', 'payment_expired', 'refunded'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
    </ListSearch><button onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh orders</button>
    <DataTable caption="Order queue" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'number', label: 'Order', render: (row) => <Link to={`/orders/${row.id}`}>{row.order_number}</Link> },
      { key: 'state', label: 'State', render: (row) => <StatusBadge label={row.state.replaceAll('_', ' ')} /> },
      { key: 'total', label: 'Total', render: (row) => money(row.total_agorot) },
      { key: 'created', label: 'Created (Israel time)', render: (row) => dateTime(row.created_at) },
    ]} /><Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
  </section>;
}
