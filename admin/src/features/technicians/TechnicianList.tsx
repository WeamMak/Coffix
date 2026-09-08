import { useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { ConfirmAction } from '../../components/ConfirmAction';
import { ActiveFilter, ListSearch, Pagination, useListFilters } from '../../components/CommerceControls';
import { useWebSession } from '../auth/useWebSession';
import { text, useStaffQuery, useStaffSave, type Schema } from '../service/api';

export function TechnicianList() {
  const filters = useListFilters();
  const query = useStaffQuery<Schema['AdminUserRead'][]>(`/admin/users?${filters.query}`);
  const [edit, setEdit] = useState<Schema['AdminUserRead'] | null>(null);
  return <section><h1>People and technicians</h1><p>Find existing accounts by name or phone, review staff roles, and manage access.</p>
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)}>
      <label className="form-field">Filter role<select value={filters.params.get('role') ?? ''} onChange={(event) => filters.change('role', event.target.value)}><option value="">All roles</option><option value="customer">Customers</option><option value="technician">Technicians</option><option value="admin">Administrators</option></select></label>
      <ActiveFilter value={filters.params.get('active') ?? ''} onChange={(value) => filters.change('active', value)} />
    </ListSearch>
    <DataTable caption="People" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'Name', render: (row) => row.display_name ?? 'Unnamed account' },
      { key: 'phone', label: 'Phone', render: (row) => row.phone_e164 },
      { key: 'role', label: 'Role', render: (row) => row.role },
      { key: 'active', label: 'Access', render: (row) => row.is_active ? 'Active' : 'Inactive' },
      { key: 'edit', label: 'Action', render: (row) => <button onClick={() => setEdit(row)}>Manage {row.display_name ?? row.phone_e164}</button> },
    ]} /><Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
    {edit ? <AccessEditor key={edit.id} person={edit} close={() => setEdit(null)} /> : null}
  </section>;
}
function AccessEditor({ person, close }: { person: Schema['AdminUserRead']; close: () => void }) {
  const { client, session } = useWebSession();
  const [draft, setDraft] = useState<Schema['UserAccessUpdate'] | null>(null);
  const save = useStaffSave((body: Schema['UserAccessUpdate']) => client.api.request(`/admin/users/${person.id}`, { method: 'PATCH', body }), close);
  const self = person.id === session?.user_id;
  return <section className="editor-panel"><h2>Manage {person.display_name ?? person.phone_e164}</h2><p>{person.phone_e164} · Current role: {person.role}</p>
    {self ? <p>You cannot remove your own administrator access.</p> : null}
    <form onChange={() => setDraft(null)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const role = text(data, 'role');
      if (role === 'customer' || role === 'technician' || role === 'admin') setDraft({ role, is_active: data.has('active') });
    }}><fieldset disabled={save.isPending || self}>
      <label className="form-field">Role<select name="role" defaultValue={person.role}><option value="customer">Customer</option><option value="technician">Technician</option><option value="admin">Administrator</option></select></label>
      <label><input type="checkbox" name="active" defaultChecked={person.is_active} /> Active account</label>
      <button type="submit">Review access change</button>
    </fieldset><button type="button" onClick={close}>Discard edits</button></form>
    {draft ? <ConfirmAction label="Change access" recordLabel={`${person.display_name ?? 'Account'} · ${person.phone_e164}`} description={`Change role from ${person.role} to ${draft.role}; account will be ${draft.is_active ? 'active' : 'inactive'}. This changes which records and operations this person can access.`} onConfirm={async () => { await save.mutateAsync(draft); }} /> : null}
  </section>;
}
