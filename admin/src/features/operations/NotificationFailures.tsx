import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ConfirmAction } from '../../components/ConfirmAction';
import { ProblemBanner } from '../../components/ProblemBanner';
import { StatusBadge } from '../../components/StatusBadge';
import { Pagination, useListFilters } from '../../components/CommerceControls';
import { useWebSession } from '../auth/useWebSession';
import { dateTime, useStaffQuery, useStaffSave, type Schema } from '../service/api';
import { deliveryError, deliveryState, recordHref, retryReasons } from './presentation';

export function OperationsNav() {
  return <nav className="section-nav" aria-label="תפעול"><NavLink to="/operations" end>בעיות בשליחת התראות</NavLink><NavLink to="/operations/audit">יומן פעילות</NavLink></nav>;
}
export function NotificationFailures() {
  const filters = useListFilters();
  const query = useStaffQuery<Schema['DeliveryFailureRead'][]>(`/admin/notification-deliveries?page=${filters.page}&limit=20`, true);
  const { client } = useWebSession();
  const [queued, setQueued] = useState('');
  const command = useStaffSave((id: string) => client.api.request(`/admin/notification-deliveries/${id}/retry`, { method: 'POST' }));
  return <section><h1>בעיות בשליחת התראות</h1><OperationsNav />
    <p>ההודעה עשויה להיות זמינה באפליקציה גם כששליחת ההתראה למכשיר נכשלה. לכל מכשיר מופיע ניסיון נפרד.</p>
    <p className="muted">העברה לתור אינה אישור שליחה. אישור הספק אינו אישור שהלקוח קרא את ההודעה.</p>
    {queued ? <p role="status" className="outcome">השליחה החוזרת הועברה לתור · <bdi dir="auto">{queued}</bdi>. ממתינים לטיפול ולעדכון הספק.</p> : null}
    <ProblemBanner error={query.error} />
    <button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>טעינה מחדש</button>
    {query.isPending ? <p role="status" className="empty-state">טוענים בעיות בשליחת התראות…</p> : !query.error && !query.data?.length ? <p className="empty-state">אין כרגע בעיות בשליחת התראות.</p> : null}
    <ul className="notification-list" aria-label="בעיות בשליחת התראות">{(!query.error ? query.data ?? [] : []).map((row) => {
      const recipient = row.recipient_name ?? row.recipient_phone ?? 'נמען ללא פרטים זמינים';
      const href = row.related_entity_reference ? recordHref(row.related_entity_type, row.related_entity_id, row.related_entity_reference) : null;
      const description = `${recipient} · ${row.notification_title}`;
      return <li key={row.id} className="notification-card">
        <div className="notification-heading"><div><strong><bdi dir="auto">{recipient}</bdi></strong><small><bdi dir="ltr">{row.recipient_phone}</bdi> · <bdi>{row.device_platform === 'ios' ? 'iOS' : 'Android'}</bdi></small></div><StatusBadge label={deliveryState(row)} tone={row.claimed_at ? 'warning' : row.state === 'dead_letter' ? 'danger' : 'neutral'} /></div>
        <h2 className="notification-title" dir="auto">{row.notification_title}</h2><p className="notification-body" dir="auto">{row.notification_body}</p>
        {href ? <Link to={href}><bdi dir="ltr">{row.related_entity_reference}</bdi></Link> : <p className="muted">אין קישור זמין לרשומה קשורה.</p>}
        <dl className="delivery-times"><div><dt>ניסיונות שליחה</dt><dd>{row.attempt_count}</dd></div><div><dt>עדכון מצב אחרון (שעון ישראל)</dt><dd>{dateTime(row.updated_at)}</dd></div>
          {row.claimed_at ? <div><dt>תחילת ניסיון (שעון ישראל)</dt><dd>{dateTime(row.claimed_at)}</dd></div> : row.dead_lettered_at ? <div><dt>השליחה הופסקה (שעון ישראל)</dt><dd>{dateTime(row.dead_lettered_at)}</dd></div> : <div><dt>ניסיון הבא (שעון ישראל)</dt><dd>{dateTime(row.next_attempt_at)}</dd></div>}
        </dl>
        <div className="notification-notice"><p>{deliveryError(row.last_error_code)}</p>{row.can_retry ? <p>{row.state === 'retry' ? 'אפשר להמתין לניסיון המתוכנן או להעביר ניסיון נוסף לתור.' : 'אפשר להעביר ניסיון נוסף לתור לאחר בדיקת התקלה.'}</p> : null}{!row.can_retry ? <p>{retryReasons[row.retry_unavailable_reason ?? ''] ?? 'ניסיון נוסף אינו זמין כרגע. רעננו לבדיקת המצב.'}</p> : null}</div>
        <div className="notification-footer"><details><summary>פרטים טכניים</summary><dl className="definition-list">
          <div><dt>מזהה שליחה</dt><dd><bdi dir="ltr">{row.id}</bdi></dd></div><div><dt>מזהה התראה</dt><dd><bdi dir="ltr">{row.notification_id}</bdi></dd></div>
          <div><dt>מזהה רשומה קשורה</dt><dd><bdi dir="ltr">{row.related_entity_id ?? '—'}</bdi></dd></div><div><dt>סוג רשומה</dt><dd><bdi dir="ltr">{row.related_entity_type}</bdi></dd></div>
          <div><dt>קוד השגיאה האחרונה</dt><dd><bdi dir="ltr">{row.last_error_code ?? '—'}</bdi></dd></div><div><dt>מצב שמור</dt><dd><bdi dir="ltr">{row.state}</bdi></dd></div>
        </dl></details>
          {row.can_retry ? <ConfirmAction label="ניסיון שליחה חוזר" recordLabel={description} description="הוספת ניסיון שליחה לתור. ההתראה עשויה להישלח שוב אם תשובת הספק לניסיון הקודם אבדה." onConfirm={async () => { await command.mutateAsync(row.id); setQueued(description); }} /> : null}
        </div>
      </li>;
    })}</ul>
    <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
  </section>;
}
