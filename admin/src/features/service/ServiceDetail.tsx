import { Link, useParams } from 'react-router-dom';
import { ProblemBanner } from '../../components/ProblemBanner';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime, label, money, useStaffQuery, type Schema } from './api';
import { QuoteForm } from './QuoteForm';
import { AppointmentForm } from './AppointmentForm';
import { AssignmentForm } from './AssignmentForm';
import { ServiceActions } from './ServiceActions';
import { ServiceNotes } from './ServiceNotes';
import { ServiceMedia } from './ServiceMedia';
import { ApiClientError } from '@coffix/api-client';

export function ServiceDetail() {
  const { requestId = '' } = useParams();
  return <ServiceRecord key={requestId} requestId={requestId} />;
}
export function ServiceRecord({ requestId, technician = false }: { requestId: string; technician?: boolean }) {
  const path = technician ? `/technician/jobs/${requestId}` : `/admin/service-requests/${requestId}`;
  const query = useStaffQuery<Schema['StaffServiceRequestRead']>(path, true);
  if (query.error instanceof ApiClientError && [403, 404].includes(query.error.problem.status)) return <ProblemBanner error={query.error} />;
  if (!query.data) return query.isPending ? <p role="status">טוענים את בקשת השירות…</p> : <ProblemBanner error={query.error} />;
  const service = query.data;
  return <section><Link className="back-link" to={technician ? '/jobs' : '/service'}>{technician ? 'חזרה לעבודות שלי' : 'חזרה לבקשות השירות'}</Link>
    <div className="record-header editor-panel"><div><div className="record-title"><h1><bdi dir="ltr">{service.reference}</bdi></h1><strong>· <bdi dir="auto">{service.customer.display_name ?? 'לקוח'}</bdi></strong></div>
      <p className="muted"><bdi dir="auto">{service.machine.manufacturer} {service.machine.model_name}</bdi> · מספר סידורי: <bdi dir="ltr">{service.machine.serial_number ?? 'טרם נקבע'}</bdi></p>
    </div><div className="record-badges"><StatusBadge label={label(service.state)} /><StatusBadge label={`${service.urgency_name_he}${service.urgency_surcharge_percent ? ` +${service.urgency_surcharge_percent}%` : ''}`} tone={service.urgency_surcharge_percent ? 'warning' : 'neutral'} /></div>
      <button disabled={query.isFetching} onClick={() => void query.refetch()}>רענון הבקשה</button></div>
    <ProblemBanner error={query.error} />
    {technician ? <ServiceActions service={service} technician /> : null}
    {service.state === 'awaiting_diagnostic_payment' ? <p className="outcome">ממתינים לתשלום דמי האבחון. תיאום ועבודה יתאפשרו לאחר אישור התשלום.</p> : null}
    {['awaiting_additional_decision', 'awaiting_additional_payment'].includes(service.state) ? <p className="outcome">התיקון מושהה עד לאישור הלקוח ולתשלום ההצעה הנוספת.</p> : null}
    <div className="record-layout"><div className="record-primary">
      <section className="editor-panel"><h2>תיאור התקלה</h2><p className="preserve-lines" dir="auto">{service.description}</p></section>
      <ServiceMedia service={service} technician={technician} />
      <section className="editor-panel"><h2>תמחור שנשמר בבקשה</h2>
        <div className="price-summary"><div><strong>דמי אבחון בסיסיים</strong><small>המחיר לפני תוספת הדחיפות</small></div><strong><bdi>{service.diagnostic_base_fee_agorot === null ? 'טרם נקבעו' : money(service.diagnostic_base_fee_agorot)}</bdi></strong></div>
        <div className="price-summary emphasized"><div><strong>דמי אבחון כוללים</strong><small>דחיפות: {service.urgency_name_he} · תוספת {service.urgency_surcharge_percent}%</small></div><strong><bdi>{service.diagnostic_fee_agorot === null ? 'טרם נקבעו' : money(service.diagnostic_fee_agorot)}</bdi></strong></div>
        {service.quotes.map((quote) => <div className="quote-summary" key={quote.id}><div className="price-summary"><h3>הצעת תיקון נוספת</h3><strong><bdi>{money(quote.amount_agorot)}</bdi></strong></div><p dir="auto">{quote.explanation}</p><p>{label(quote.decision)} · {dateTime(quote.decided_at)}</p></div>)}
      </section>
      {!technician && service.allowed_actions.includes('set_diagnostic_fee') ? <QuoteForm key={service.state} service={service} diagnostic /> : null}
      {!technician && service.allowed_actions.includes('quote') ? <QuoteForm key={service.state} service={service} /> : null}
      <ServiceNotes service={service} technician={technician} />
    </div><div className="record-support">
      <section className="editor-panel"><h2>שירות ומיקום</h2><dl className="definition-list"><div><dt>סוג שירות</dt><dd dir="auto">{service.service_type_label_he}</dd></div><div><dt>דחיפות</dt><dd dir="auto">{service.urgency_name_he}</dd></div><div><dt>אופן טיפול</dt><dd>{service.location_mode === 'pickup' ? 'איסוף' : 'הבאה לחנות'}</dd></div></dl>
        <p className="field-caption">כתובת שנשמרה בבקשה</p><address dir="auto">{Object.values(service.address_snapshot).filter((value) => typeof value === 'string').join(', ')}</address><p><a dir="ltr" href={`tel:${service.customer.phone_e164}`}>{service.customer.phone_e164}</a></p>
      </section>
      <section className="editor-panel"><h2>תיאום</h2><p className="field-caption">מועד מועדף</p><p>{dateTime(service.preferred_window_start)} – {dateTime(service.preferred_window_end)}</p><p className="subtle-notice">החלון המועדף הוא בקשת הלקוח. המועד בפועל דורש אישור.</p>
        <p className="field-caption">מועד מאושר</p><p>{service.confirmed_appointment_start ? `${dateTime(service.confirmed_appointment_start)} – ${dateTime(service.confirmed_appointment_end)}` : 'טרם נקבע'}</p>
        <dl className="definition-list"><div><dt>טכנאי משובץ</dt><dd><bdi dir={service.assigned_technician?.display_name ? 'auto' : 'ltr'}>{service.assigned_technician?.display_name ?? service.assigned_technician?.phone_e164 ?? 'טרם שובץ'}</bdi></dd></div></dl><p className="muted">השעות מוצגות לפי שעון ישראל.</p>
      </section>
      {!technician && service.allowed_actions.includes('schedule') ? <AppointmentForm service={service} /> : null}
      {!technician && service.allowed_actions.includes('assign') ? <AssignmentForm service={service} /> : null}
      <section className="editor-panel"><h2>מידע על השירות</h2><p>זמן תגובה צפוי: {service.response_hours} שעות.</p><p className="muted">תשלומי השירות אינם ניתנים להחזר.</p></section>
      <section className="editor-panel"><h2>היסטוריית מצבים</h2>{service.history.length ? <ol className="timeline">{service.history.map((entry, index) => <li key={`${entry.created_at}:${index}`}><strong>{label(entry.to_state)}</strong><small>{dateTime(entry.created_at)} · {entry.staff_name ?? label(entry.source)}</small>{entry.reason ? <p dir="auto">{entry.reason}</p> : null}</li>)}</ol> : <p className="muted">לא תועדו שינויי מצב.</p>}</section>
      {!technician ? <ServiceActions service={service} technician={false} /> : null}
    </div></div>
  </section>;
}
