import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { ConfirmAction } from '../../components/ConfirmAction';
import { Pagination, useListFilters } from '../../components/CommerceControls';
import { useWebSession } from '../auth/useWebSession';
import { dateTime, label, useStaffQuery, useStaffSave, type Schema } from '../service/api';

export function OperationsNav() {
  return <nav className="section-nav" aria-label="Operations"><NavLink to="/operations" end>Notification failures</NavLink><NavLink to="/operations/audit">Audit log</NavLink></nav>;
}
export function NotificationFailures() {
  const filters = useListFilters();
  const query = useStaffQuery<Schema['DeliveryFailureRead'][]>(`/admin/notification-deliveries?page=${filters.page}&limit=20`, true);
  const { client } = useWebSession();
  const [queued, setQueued] = useState('');
  const command = useStaffSave((id: string) => client.api.request(`/admin/notification-deliveries/${id}/retry`, { method: 'POST' }));
  return <section><h1>Notification failures</h1><OperationsNav /><p>Review failed attempts and queue a fresh delivery attempt for an eligible device.</p>
    {queued ? <p role="status" className="outcome">Retry queued for {queued}. Delivery is awaiting the worker and provider.</p> : null}
    <DataTable caption="Failed deliveries" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'id', label: 'Delivery / notification', render: (row) => <>{row.id}<br />{row.notification_id}</> },
      { key: 'state', label: 'State', render: (row) => label(row.state) },
      { key: 'attempts', label: 'Attempts', render: (row) => row.attempt_count },
      { key: 'error', label: 'Last error', render: (row) => row.last_error_code ?? '—' },
      { key: 'next', label: 'Next attempt / stopped', render: (row) => dateTime(row.dead_lettered_at ?? row.next_attempt_at) },
      { key: 'retry', label: 'Action', render: (row) => row.can_retry ? <ConfirmAction label="Retry delivery" recordLabel={row.id} description="Queue a new delivery attempt. This can send the notification again if an earlier provider response was lost." onConfirm={async () => { await command.mutateAsync(row.id); setQueued(row.id); }} /> : 'Device unavailable or delivery in progress' },
    ]} />
    <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
  </section>;
}
