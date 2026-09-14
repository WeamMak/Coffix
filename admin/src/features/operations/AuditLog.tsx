import { useSearchParams } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { FormField } from '../../components/FormField';
import { label } from '../../components/labels';
import { Pagination, useListFilters } from '../../components/CommerceControls';
import { dateTime, text, useStaffQuery, type Schema } from '../service/api';
import { OperationsNav } from './NotificationFailures';

export function AuditLog() {
  const filters = useListFilters();
  const [, setParams] = useSearchParams();
  const query = useStaffQuery<Schema['AuditLogRead'][]>(`/admin/audit-logs?${filters.query}`);
  return <section><h1>יומן פעילות</h1><OperationsNav />
    <div className="list-panel no-caption"><form className="audit-filters" key={filters.params.toString()} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const next = new URLSearchParams();
      for (const name of ['action', 'target_type', 'target_id', 'actor_id', 'from_time', 'to_time']) { const value = text(data, name); if (value) next.set(name, name.endsWith('_time') ? new Date(`${value}Z`).toISOString() : value); }
      setParams(next);
    }}><div className="form-grid">
      <FormField label="קוד הפעולה מכיל" name="action" defaultValue={filters.params.get('action') ?? ''} maxLength={120} />
      <FormField label="סוג רשומה" name="target_type" defaultValue={filters.params.get('target_type') ?? ''} maxLength={60} />
      <FormField label="מזהה רשומה" name="target_id" defaultValue={filters.params.get('target_id') ?? ''} />
      <FormField label="מזהה מבצע" name="actor_id" defaultValue={filters.params.get('actor_id') ?? ''} />
      <FormField label="מתאריך (UTC)" type="datetime-local" name="from_time" defaultValue={filters.params.get('from_time')?.slice(0, 16) ?? ''} />
      <FormField label="עד לתאריך, לא כולל (UTC)" type="datetime-local" name="to_time" defaultValue={filters.params.get('to_time')?.slice(0, 16) ?? ''} />
    </div><button type="submit">סינון יומן הפעילות</button></form>
    <DataTable caption="אירועי פעילות" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'time', label: 'שעון ישראל', render: (row) => dateTime(row.created_at) },
      { key: 'action', label: 'פעולה', render: (row) => label(row.action) },
      { key: 'actor', label: 'מבצע', render: (row) => <bdi dir="ltr">{row.actor_id ?? 'מערכת'}</bdi> },
      { key: 'target', label: 'רשומה', render: (row) => <>{label(row.target_type)}<br /><bdi dir="ltr">{row.target_id}</bdi></> },
      { key: 'changes', label: 'פרטים', render: (row) => <details><summary>פרטים טכניים</summary><p>קוד פעולה: <bdi dir="ltr">{row.action}</bdi></p><p>סוג רשומה: <bdi dir="ltr">{row.target_type}</bdi></p><p>אסמכתה לתמיכה: <bdi dir="ltr">{row.correlation_id ?? '—'}</bdi></p><pre>{JSON.stringify({ before: row.before, after: row.after }, null, 2)}</pre></details> },
    ]} />
    <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
    </div>
  </section>;
}
