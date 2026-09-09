import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { ListSearch, Pagination, useListFilters } from '../../components/CommerceControls';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime, label, serviceStates, useStaffQuery, type Schema } from './api';

export function ServiceQueue() {
  const filters = useListFilters();
  const query = useStaffQuery<Schema['ServiceQueueRead'][]>(`/admin/service-requests?${filters.query}`, true);
  return <section><h1>Service queue</h1><p>Review intake, payment status, appointments, and repair progress.</p>
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)}>
      <label className="form-field">Service state<select value={filters.params.get('state') ?? ''} onChange={(event) => filters.change('state', event.target.value)}><option value="">All states</option>{serviceStates.map((state) => <option key={state} value={state}>{label(state)}</option>)}</select></label>
    </ListSearch>
    <DataTable caption="Service requests" rows={query.data ?? []} rowKey={(row) => row.id} loading={query.isPending} error={query.error} columns={[
      { key: 'reference', label: 'Request', render: (row) => <Link to={`/service/${row.id}`}>{row.reference}</Link> },
      { key: 'state', label: 'State', render: (row) => <StatusBadge label={label(row.state)} /> },
      { key: 'assignment', label: 'Assignment', render: (row) => row.assigned_technician_id ? 'Assigned' : 'Unassigned' },
      { key: 'updated', label: 'Updated (Israel time)', render: (row) => dateTime(row.updated_at) },
    ]} />
    <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
  </section>;
}
