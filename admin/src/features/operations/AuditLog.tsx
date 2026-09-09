import { useSearchParams } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { FormField } from '../../components/FormField';
import { Pagination, useListFilters } from '../../components/CommerceControls';
import { dateTime, text, useStaffQuery, type Schema } from '../service/api';
import { OperationsNav } from './NotificationFailures';

export function AuditLog() {
  const filters = useListFilters();
  const [, setParams] = useSearchParams();
  const query = useStaffQuery<Schema['AuditLogRead'][]>(`/admin/audit-logs?${filters.query}`);
  return <section><h1>Audit log</h1><OperationsNav />
    <form className="editor-panel" key={filters.params.toString()} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const next = new URLSearchParams();
      for (const name of ['action', 'target_type', 'target_id', 'actor_id', 'from_time', 'to_time']) { const value = text(data, name); if (value) next.set(name, name.endsWith('_time') ? new Date(`${value}Z`).toISOString() : value); }
      setParams(next);
    }}><div className="detail-grid">
      <FormField label="Action contains" name="action" defaultValue={filters.params.get('action') ?? ''} maxLength={120} />
      <FormField label="Target type" name="target_type" defaultValue={filters.params.get('target_type') ?? ''} maxLength={60} />
      <FormField label="Target ID" name="target_id" defaultValue={filters.params.get('target_id') ?? ''} />
      <FormField label="Actor ID" name="actor_id" defaultValue={filters.params.get('actor_id') ?? ''} />
      <FormField label="From (UTC)" type="datetime-local" name="from_time" defaultValue={filters.params.get('from_time')?.slice(0, 16) ?? ''} />
      <FormField label="Until (UTC, exclusive)" type="datetime-local" name="to_time" defaultValue={filters.params.get('to_time')?.slice(0, 16) ?? ''} />
    </div><button type="submit">Apply audit filters</button></form>
    <DataTable caption="Audit events" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'time', label: 'Israel time', render: (row) => dateTime(row.created_at) },
      { key: 'action', label: 'Action', render: (row) => row.action },
      { key: 'actor', label: 'Actor', render: (row) => row.actor_id ?? 'System' },
      { key: 'target', label: 'Target', render: (row) => <>{row.target_type}<br />{row.target_id}</> },
      { key: 'changes', label: 'Details', render: (row) => <details><summary>View event</summary><p>Correlation: {row.correlation_id ?? '—'}</p><pre>{JSON.stringify({ before: row.before, after: row.after }, null, 2)}</pre></details> },
    ]} />
    <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
  </section>;
}
