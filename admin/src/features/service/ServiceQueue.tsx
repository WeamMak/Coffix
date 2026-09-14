import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { ListSearch, Pagination, useListFilters } from '../../components/CommerceControls';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime, label, serviceStates, useStaffQuery, type Schema } from './api';

export function ServiceQueue() {
  const filters = useListFilters();
  const query = useStaffQuery<Schema['ServiceQueueRead'][]>(`/admin/service-requests?${filters.query}`, true);
  return <section><h1>בקשות שירות</h1><div className="list-panel no-caption">
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)}>
      <label className="form-field">מצב בקשה<select value={filters.params.get('state') ?? ''} onChange={(event) => filters.change('state', event.target.value)}><option value="">כל המצבים</option>{serviceStates.map((state) => <option key={state} value={state}>{label(state)}</option>)}</select></label>
    </ListSearch>
    <DataTable caption="בקשות שירות" rows={query.data ?? []} rowKey={(row) => row.id} loading={query.isPending} error={query.error} columns={[
      { key: 'reference', label: 'בקשה', render: (row) => <Link dir="ltr" to={`/service/${row.id}`}>{row.reference}</Link> },
      { key: 'state', label: 'מצב', render: (row) => <StatusBadge label={label(row.state)} /> },
      { key: 'assignment', label: 'שיבוץ', render: (row) => row.assigned_technician_id ? 'משובץ' : 'טרם שובץ' },
      { key: 'updated', label: 'עודכן (שעון ישראל)', render: (row) => dateTime(row.updated_at) },
    ]} />
    <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
  </div></section>;
}
