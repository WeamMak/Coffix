import { label } from '../../components/labels';
import { useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { ProblemBanner } from '../../components/ProblemBanner';
import { StatusBadge } from '../../components/StatusBadge';
import { ActiveFilter, ListSearch, Pagination, useListFilters } from '../../components/CommerceControls';
import { useWebSession } from '../auth/useWebSession';
import { text, useStaffQuery, useStaffSave, type Schema } from '../service/api';

export function TechnicianList() {
  const filters = useListFilters();
  const query = useStaffQuery<Schema['AdminUserRead'][]>(`/admin/users?${filters.query}`);
  const [edit, setEdit] = useState<Schema['AdminUserRead'] | null>(null);
  return <section><h1>אנשים והרשאות</h1><div className={edit ? 'list-editor-layout' : undefined}><div className="list-panel no-caption">
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)}>
      <label className="form-field">סינון לפי תפקיד<select value={filters.params.get('role') ?? ''} onChange={(event) => filters.change('role', event.target.value)}><option value="">כל התפקידים</option><option value="customer">לקוחות</option><option value="technician">טכנאים</option><option value="admin">מנהלים</option></select></label>
      <ActiveFilter value={filters.params.get('active') ?? ''} onChange={(value) => filters.change('active', value)} />
    </ListSearch>
    <DataTable caption="אנשים והרשאות" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'שם', render: (row) => row.display_name ?? 'חשבון ללא שם' },
      { key: 'phone', label: 'טלפון', render: (row) => <bdi dir="ltr">{row.phone_e164}</bdi> },
      { key: 'role', label: 'תפקיד', render: (row) => <StatusBadge label={label(row.role)} tone={row.role === 'technician' ? 'warning' : row.role === 'admin' ? 'success' : 'neutral'} /> },
      { key: 'active', label: 'גישה', render: (row) => <StatusBadge label={row.is_active ? 'פעיל' : 'לא פעיל'} tone={row.is_active ? 'success' : 'neutral'} /> },
      { key: 'edit', label: 'פעולה', render: (row) => <button onClick={() => setEdit(row)}>ניהול <bdi dir={row.display_name ? 'auto' : 'ltr'}>{row.display_name ?? row.phone_e164}</bdi></button> },
    ]} /><Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
    </div>
    {edit ? <AccessEditor key={edit.id} person={edit} close={() => setEdit(null)} /> : null}
  </div></section>;
}
function AccessEditor({ person, close }: { person: Schema['AdminUserRead']; close: () => void }) {
  const { client, session } = useWebSession();
  const [draft, setDraft] = useState<Schema['UserAccessUpdate'] | null>(null);
  const save = useStaffSave((body: Schema['UserAccessUpdate']) => client.api.request(`/admin/users/${person.id}`, { method: 'PATCH', body }), close);
  const self = person.id === session?.user_id;
  return <section className="editor-panel"><h2>ניהול <bdi dir={person.display_name ? 'auto' : 'ltr'}>{person.display_name ?? person.phone_e164}</bdi></h2><p><bdi dir="ltr">{person.phone_e164}</bdi> · התפקיד הנוכחי: {label(person.role)}</p>
    {self ? <p>לא ניתן להסיר את הרשאות הניהול של עצמכם.</p> : null}
    <p>השבתת החשבון חוסמת גישה ושומרת את ההזמנות, המכונות ובקשות השירות.</p>
    <dl className="role-capabilities"><div><dt>לקוח</dt><dd>רכישה וניהול המכונות ובקשות השירות האישיות באפליקציה.</dd></div><div><dt>טכנאי</dt><dd>צפייה וטיפול בעבודות ששובצו אליו בלבד.</dd></div><div><dt>מנהל</dt><dd>ניהול החנות, הזמנות, שירות, אנשים ותפעול.</dd></div></dl>
    <p>סקירת השינוי מציגה תצוגה מקדימה. ההרשאות משתנות רק לאחר אישור.</p>
    <form onChange={() => setDraft(null)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const role = text(data, 'role');
      if (role === 'customer' || role === 'technician' || role === 'admin') setDraft({ role, is_active: data.has('active') });
    }}><fieldset disabled={save.isPending || self}>
      <label className="form-field">תפקיד<select name="role" defaultValue={person.role}><option value="customer">לקוח</option><option value="technician">טכנאי</option><option value="admin">מנהל</option></select></label>
      <label><input type="checkbox" name="active" defaultChecked={person.is_active} />  חשבון פעיל</label>
      <button type="submit">סקירת שינוי הרשאות</button>
    </fieldset><button type="button" onClick={close}>ביטול השינויים</button></form>
    {draft ? <section className="access-review" aria-label="סקירת שינוי הרשאות">
      <h3>סקירת שינוי הרשאות</h3>
      <p><bdi dir="auto">{person.display_name ?? 'חשבון ללא שם'}</bdi> · <bdi dir="ltr">{person.phone_e164}</bdi></p>
      <dl className="definition-list"><div><dt>תפקיד: נוכחי → מוצע</dt><dd className="change-values" dir="ltr"><bdi>{label(person.role)}</bdi>{' → '}<bdi>{label(draft.role ?? person.role)}</bdi></dd></div>
        <div><dt>גישה: נוכחית → מוצעת</dt><dd className="change-values" dir="ltr"><bdi>{person.is_active ? 'פעיל' : 'לא פעיל'}</bdi>{' → '}<bdi>{draft.is_active ? 'פעיל' : 'לא פעיל'}</bdi></dd></div></dl>
      <p>לא ניתן להסיר את הגישה של המנהל הפעיל האחרון.</p>
      <ProblemBanner error={save.error} />
      <button type="button" disabled={save.isPending} onClick={() => { if (!save.isPending) save.mutate(draft); }}>{save.isPending ? 'מעדכנים הרשאות…' : 'אישור שינוי הרשאות'}</button>
    </section> : null}
  </section>;
}
