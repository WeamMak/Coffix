import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ConfirmAction } from '../../components/ConfirmAction';
import { ProblemBanner } from '../../components/ProblemBanner';
import { StatusBadge } from '../../components/StatusBadge';
import { Pagination, useListFilters } from '../../components/CommerceControls';
import { useWebSession } from '../auth/useWebSession';
import { dateTime, label, useStaffQuery, useStaffSave, type Schema } from '../service/api';

export function OperationsNav() {
  return <nav className="section-nav" aria-label="תפעול"><NavLink to="/operations" end>התראות שלא נשלחו</NavLink><NavLink to="/operations/audit">יומן פעילות</NavLink></nav>;
}
export function NotificationFailures() {
  const filters = useListFilters();
  const query = useStaffQuery<Schema['DeliveryFailureRead'][]>(`/admin/notification-deliveries?page=${filters.page}&limit=20`, true);
  const { client } = useWebSession();
  const [queued, setQueued] = useState('');
  const command = useStaffSave((id: string) => client.api.request(`/admin/notification-deliveries/${id}/retry`, { method: 'POST' }));
  return <section><h1>התראות שלא נשלחו</h1><OperationsNav />
    {queued ? <p role="status" className="outcome">ניסיון חוזר נוסף לתור עבור <bdi dir="ltr">{queued}</bdi>. השליחה ממתינה לטיפול ולאישור הספק.</p> : null}
    <ProblemBanner error={query.error} />
    {query.isPending ? <p role="status" className="empty-state">טוענים שליחות שנכשלו…</p> : !query.error && !query.data?.length ? <p className="empty-state">לא נמצאו שליחות שנכשלו.</p> : null}
    <ul className="notification-list" aria-label="שליחות שנכשלו">{(query.data ?? []).map((row) => <li key={row.id} className="notification-card">
      <div className="notification-heading"><div><strong>שליחת התראה נכשלה</strong><small>{row.attempt_count} ניסיונות שליחה · {row.dead_lettered_at ? 'הניסיונות הופסקו' : 'הניסיון הבא'}: {dateTime(row.dead_lettered_at ?? row.next_attempt_at)}</small></div><StatusBadge label={label(row.state)} tone="danger" /></div>
      <div className="notification-notice">{row.can_retry ? 'ניתן להוסיף ניסיון שליחה חוזר לתור.' : 'המכשיר אינו זמין או שהשליחה מתבצעת.'}</div>
      <div className="notification-footer"><details><summary>פרטים טכניים</summary><dl className="definition-list"><div><dt>מזהה שליחה</dt><dd><bdi dir="ltr">{row.id}</bdi></dd></div><div><dt>מזהה התראה</dt><dd><bdi dir="ltr">{row.notification_id}</bdi></dd></div><div><dt>קוד השגיאה האחרונה</dt><dd><bdi dir="ltr">{row.last_error_code ?? '—'}</bdi></dd></div></dl></details>
        {row.can_retry ? <ConfirmAction label="ניסיון שליחה חוזר" recordLabel={row.id} description="הוספת ניסיון שליחה לתור. ההתראה עשויה להישלח שוב אם תשובת הספק לניסיון הקודם אבדה." onConfirm={async () => { await command.mutateAsync(row.id); setQueued(row.id); }} /> : null}
      </div>
    </li>)}</ul>
    <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
  </section>;
}
