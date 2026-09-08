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
  if (!query.data) return query.isPending ? <p role="status">Loading service request…</p> : <ProblemBanner error={query.error} />;
  const service = query.data;
  return <section><Link to={technician ? '/jobs' : '/service'}>{technician ? 'Back to my jobs' : 'Back to service queue'}</Link>
    <h1>{service.reference}</h1><StatusBadge label={label(service.state)} />
    <div className="page-actions"><button disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh request</button></div>
    <ProblemBanner error={query.error} />
    <ServiceActions service={service} technician={technician} />
    {service.state === 'awaiting_diagnostic_payment' ? <p className="outcome">Awaiting diagnostic payment. Scheduling and active work become available after payment confirmation.</p> : null}
    {['awaiting_additional_decision', 'awaiting_additional_payment'].includes(service.state) ? <p className="outcome">Repair is paused until the customer accepts and pays the additional quote.</p> : null}
    <div className="detail-grid"><section className="editor-panel"><h2>Machine and customer</h2><p>{service.machine.manufacturer} {service.machine.model_name}</p><p>{service.machine.serial_number ?? 'Serial pending'}</p><p dir="auto">{service.customer.display_name ?? 'Customer'}</p><a href={`tel:${service.customer.phone_e164}`}>{service.customer.phone_e164}</a><p dir="auto">{service.service_type_label_he}</p><p className="preserve-lines" dir="auto">{service.description}</p></section>
      <section className="editor-panel"><h2>Location and appointment</h2><p>{service.location_mode === 'pickup' ? 'Pickup' : 'Bring in to shop'}</p><address dir="auto">{Object.values(service.address_snapshot).filter((value) => typeof value === 'string').join(', ')}</address>
        <p>Preferred: {dateTime(service.preferred_window_start)} – {dateTime(service.preferred_window_end)}</p><p>Confirmed: {dateTime(service.confirmed_appointment_start)} – {dateTime(service.confirmed_appointment_end)}</p><p>Times in Asia/Jerusalem.</p>
        <p>Technician: {service.assigned_technician?.display_name ?? service.assigned_technician?.phone_e164 ?? 'Unassigned'}</p></section></div>
    <section className="editor-panel"><h2>Fee snapshots</h2><p>Urgency: <span dir="auto">{service.urgency_name_he}</span> · {service.urgency_surcharge_percent}%</p><p>Diagnostic base: {service.diagnostic_base_fee_agorot === null ? 'Not quoted' : money(service.diagnostic_base_fee_agorot)} · Diagnostic total: {service.diagnostic_fee_agorot === null ? 'Not quoted' : money(service.diagnostic_fee_agorot)}</p><p>Expected response: {service.response_hours} hours. Service payments are non-refundable.</p>
      {service.quotes.map((quote) => <div key={quote.id}><h3>Additional quote · {money(quote.amount_agorot)}</h3><p dir="auto">{quote.explanation}</p><p>{label(quote.decision)} · {dateTime(quote.decided_at)}</p></div>)}</section>
    {!technician && service.allowed_actions.includes('set_diagnostic_fee') ? <QuoteForm key={service.state} service={service} diagnostic /> : null}
    {!technician && service.allowed_actions.includes('quote') ? <QuoteForm key={service.state} service={service} /> : null}
    {!technician && service.allowed_actions.includes('schedule') ? <AppointmentForm service={service} /> : null}
    {!technician && service.allowed_actions.includes('assign') ? <AssignmentForm service={service} /> : null}
    <ServiceNotes service={service} technician={technician} />
    <ServiceMedia service={service} technician={technician} />
    <section className="editor-panel"><h2>Status history</h2><ol>{service.history.map((entry, index) => <li key={`${entry.created_at}:${index}`}><strong>{label(entry.to_state)}</strong> · {dateTime(entry.created_at)} · {entry.staff_name ?? entry.source}{entry.reason ? ` · ${entry.reason}` : ''}</li>)}</ol></section>
  </section>;
}
