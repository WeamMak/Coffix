import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { Pagination, useListFilters } from '../../components/CommerceControls';
import { dateTime, text, useStaffQuery, type Schema } from '../service/api';
import { InvalidAppointmentTime, israelInput, israelInstant } from '../service/time';
import { OperationsNav } from './NotificationFailures';
import { actionLabels, auditAction, auditChanges, recordHref, targetLabels } from './presentation';

function localInput(value: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? israelInput(value) : '';
}
function AuditFilters({ params, apply }: { params: URLSearchParams; apply: (next: URLSearchParams) => void }) {
  const [actorDraft, setActorDraft] = useState('');
  const [actorSearch, setActorSearch] = useState('');
  const [actorId, setActorId] = useState(params.get('actor_id') ?? '');
  const [error, setError] = useState('');
  const people = useStaffQuery<Schema['AdminUserRead'][]>(`/admin/users?q=${encodeURIComponent(actorSearch)}&limit=20&page=1`, false, Boolean(actorSearch));
  return <form className="audit-filters" onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const next = new URLSearchParams();
    try {
      for (const name of ['q', 'action', 'target_type', 'target_id', 'actor_id']) { const value = text(data, name); if (value) next.set(name, value); }
      for (const name of ['from_time', 'to_time']) { const value = text(data, name); if (value) next.set(name, israelInstant(value)); }
      if (next.has('from_time') && next.has('to_time') && next.get('from_time')! >= next.get('to_time')!) throw new InvalidAppointmentTime('סיום הטווח חייב להיות אחרי תחילתו.');
      setError(''); apply(next);
    } catch (error) { setError(error instanceof InvalidAppointmentTime ? error.message : 'בדקו את טווח התאריכים.'); }
  }}>
    <div className="form-grid">
      <FormField label="אסמכתה או שם רשומה" name="q" defaultValue={params.get('q') ?? ''} maxLength={160} placeholder="למשל מספר הזמנה או שם אדם" />
      <label className="form-field">פעולה<select name="action" defaultValue={params.get('action') ?? ''}><option value="">כל הפעולות</option>{Object.entries(actionLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}{params.get('action') && !actionLabels[params.get('action')!] ? <option value={params.get('action')!}>פעולה נוספת (מסנן קיים)</option> : null}</select></label>
      <label className="form-field">סוג רשומה<select name="target_type" defaultValue={params.get('target_type') ?? ''}><option value="">כל הרשומות</option>{Object.entries(targetLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}{params.get('target_type') && !targetLabels[params.get('target_type')!] ? <option value={params.get('target_type')!}>סוג נוסף (מסנן קיים)</option> : null}</select></label>
      <FormField label="מתאריך (שעון ישראל)" type="datetime-local" name="from_time" defaultValue={localInput(params.get('from_time'))} />
      <FormField label="עד לתאריך, לא כולל (שעון ישראל)" type="datetime-local" name="to_time" defaultValue={localInput(params.get('to_time'))} />
    </div>
    <p className="muted">החיפוש מתייחס לשמות ולאסמכתאות של רשומות קיימות. זמן הסיום אינו כלול בטווח.</p>
    <div className="actor-search">
      <FormField label="חיפוש מבצע לפי שם או טלפון" value={actorDraft} maxLength={160} onChange={(event) => setActorDraft(event.target.value)} />
      <button type="button" disabled={!actorDraft.trim() || people.isFetching} onClick={() => { const next = actorDraft.trim(); if (next === actorSearch) void people.refetch(); else setActorSearch(next); }}>חיפוש מבצע</button>
      <label className="form-field">מבצע הפעולה<select value={actorId} onChange={(event) => setActorId(event.target.value)}><option value="">כל המבצעים</option>
        {actorId && !people.data?.some((person) => person.id === actorId) ? <option value={actorId}>מבצע שנבחר — פרטים במסננים הטכניים</option> : null}
        {(people.data ?? []).map((person) => <option key={person.id} value={person.id}>{person.display_name ?? 'ללא שם'} · {person.phone_e164}</option>)}
      </select></label>
    </div>
    {actorSearch && people.isFetching ? <p role="status">מחפשים אנשים…</p> : null}
    {actorSearch && people.data?.length === 0 ? <p>לא נמצאו אנשים. נסו שם או טלפון אחר.</p> : null}
    {people.data?.length === 20 ? <p>מוצגות עד 20 תוצאות. צמצמו את החיפוש אם האדם אינו ברשימה.</p> : null}
    <ProblemBanner error={people.error} />
    <details className="technical-filters"><summary>מסננים טכניים</summary><div className="form-grid">
      <FormField label="מזהה רשומה" name="target_id" defaultValue={params.get('target_id') ?? ''} />
      <FormField label="מזהה מבצע" name="actor_id" value={actorId} onChange={(event) => setActorId(event.target.value)} />
    </div></details>
    {error ? <p role="alert">{error}</p> : null}
    <div className="toolbar"><button type="submit">סינון יומן הפעילות</button><button type="button" onClick={() => apply(new URLSearchParams())}>ניקוי מסננים</button></div>
  </form>;
}
function AuditTarget({ row }: { row: Schema['AuditLogRead'] }) {
  const href = row.target_label ? recordHref(row.target_type, row.target_id, row.target_reference ?? null) : null;
  return <><small>{targetLabels[row.target_type] ?? 'סוג רשומה נוסף'}</small><br />{href ? <Link to={href}><bdi dir="auto">{row.target_label}</bdi></Link> : <span dir="auto">{row.target_label ?? 'הרשומה אינה זמינה או שסוגה אינו נתמך'}</span>}</>;
}
function AuditDetails({ row }: { row: Schema['AuditLogRead'] }) {
  const changes = auditChanges(row);
  return <><ul className="audit-changes">{changes.map((change) => <li key={change.key}><strong>{change.label}</strong><span className="change-values" dir="ltr"><bdi dir="auto">{change.before}</bdi>{' → '}<bdi dir="auto">{change.after}</bdi></span>{change.unchanged ? <small>ללא שינוי</small> : null}</li>)}</ul>
    {!changes.length ? <p>לא תועדו ערכי לפני ואחרי לאירוע זה.</p> : null}
    <details><summary>פרטים טכניים</summary><dl className="definition-list">
      <div><dt>קוד פעולה</dt><dd><bdi dir="ltr">{row.action}</bdi></dd></div><div><dt>סוג רשומה</dt><dd><bdi dir="ltr">{row.target_type}</bdi></dd></div>
      <div><dt>מזהה רשומה</dt><dd><bdi dir="ltr">{row.target_id ?? '—'}</bdi></dd></div><div><dt>מזהה מבצע</dt><dd><bdi dir="ltr">{row.actor_id ?? '—'}</bdi></dd></div>
      <div><dt>מזהה אירוע</dt><dd><bdi dir="ltr">{row.id}</bdi></dd></div><div><dt>אסמכתה לתמיכה</dt><dd><bdi dir="ltr">{row.correlation_id ?? '—'}</bdi></dd></div>
    </dl><pre dir="ltr">{JSON.stringify({ before: row.before, after: row.after, request_metadata: row.request_metadata, ip_address: row.ip_address }, null, 2)}</pre></details>
  </>;
}
export function AuditLog() {
  const filters = useListFilters();
  const [, setParams] = useSearchParams();
  const [reset, setReset] = useState(0);
  const query = useStaffQuery<Schema['AuditLogRead'][]>(`/admin/audit-logs?${filters.query}`);
  return <section className="audit-page"><h1>יומן פעילות</h1><OperationsNav />
    <p>מי ביצע את הפעולה, איזו רשומה הושפעה ומה תועד לפני ואחרי. שמות הרשומות משקפים את המידע הזמין כיום; האירועים המקוריים נשמרים ללא שינוי.</p>
    <div className="list-panel no-caption">
      <AuditFilters key={`${reset}:${filters.params.toString()}`} params={filters.params} apply={(next) => { setParams(next); setReset((value) => value + 1); }} />
      {query.error ? <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>טעינה מחדש</button> : null}
      <DataTable caption="אירועי פעילות" emptyMessage="לא נמצאו אירועים למסננים שנבחרו. אפשר לנקות את המסננים ולהרחיב את החיפוש." rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
        { key: 'time', label: 'שעון ישראל', render: (row) => dateTime(row.created_at) },
        { key: 'actor', label: 'מבצע', render: (row) => <><bdi dir="auto">{row.actor_id ? row.actor_name ?? row.actor_phone ?? 'פרטי המבצע אינם זמינים' : 'מערכת'}</bdi>{row.actor_name && row.actor_phone ? <small><bdi dir="ltr">{row.actor_phone}</bdi></small> : null}</> },
        { key: 'action', label: 'פעולה', render: auditAction },
        { key: 'target', label: 'רשומה', render: (row) => <AuditTarget row={row} /> },
        { key: 'changes', label: 'לפני → אחרי', render: (row) => <AuditDetails row={row} /> },
      ]} />
      <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
    </div>
  </section>;
}
