import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { dateTime, text, useStaffQuery, useStaffSave, type Schema } from './api';
import { InvalidAppointmentTime, israelInput, israelInstant } from './time';
import { ApiClientError } from '@coffix/api-client';
import { errorMessage } from '../../api/errors';

type Draft = { appointment: Schema['AppointmentConfirmation']; technicianName: string; reason: string; warnings: Schema['ScheduleOverlapWarning'][] };
export function AppointmentForm({ service, assignment = false }: { service: Schema['StaffServiceRequestRead']; assignment?: boolean }) {
  const { client } = useWebSession();
  const [search, setSearch] = useState('');
  const technicians = useStaffQuery<Schema['AdminUserRead'][]>(`/admin/technicians?active=true&limit=100&q=${encodeURIComponent(search)}`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [allow, setAllow] = useState(false);
  const [validation, setValidation] = useState('');
  const prefix = `/admin/service-requests/${service.id}`;
  const preview = useMutation({ mutationFn: (body: Schema['AppointmentConfirmation']) => client.api.request<Schema['ScheduleOverlapWarning'][]>(`${prefix}/appointment-preview`, { method: 'POST', body }) });
  const command = useStaffSave((body: Schema['AppointmentConfirmation'] | Schema['AssignmentChange']) => client.api.request(`${prefix}/${assignment ? 'assignment' : 'appointment'}`, { method: 'POST', body }));
  return <section className="editor-panel"><h2>{assignment ? 'שינוי שיבוץ' : 'אישור מועד ושיבוץ טכנאי'}</h2>
    <p>{assignment ? `הטכנאי המשובץ כעת: ${service.assigned_technician?.display_name ?? (service.assigned_technician?.phone_e164 ? `\u2066${service.assigned_technician.phone_e164}\u2069` : 'טרם שובץ')}. המועד המאושר אינו משתנה.` : 'החלונות המועדפים הם בקשת הלקוח. אשרו את המועד בפועל לפי שעון ישראל.'}</p>
    <ProblemBanner error={technicians.error ?? preview.error} />{validation ? <p role="alert">{validation}</p> : null}
    <form onChange={() => { setDraft(null); setAllow(false); }} onSubmit={async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setValidation('');
      try {
        const appointment = { allow_overlap: false, technician_id: text(data, 'technician'), start: assignment ? service.confirmed_appointment_start! : israelInstant(text(data, 'start')), end: assignment ? service.confirmed_appointment_end! : israelInstant(text(data, 'end')) };
        if (Date.parse(appointment.end) <= Date.parse(appointment.start)) { setValidation('זמן הסיום חייב להיות אחרי זמן ההתחלה.'); return; }
        const warnings = await preview.mutateAsync(appointment);
        const technician = technicians.data?.find((item) => item.id === appointment.technician_id);
        setDraft({ appointment, technicianName: technician?.display_name ?? `\u2066${technician?.phone_e164 ?? appointment.technician_id}\u2069`, reason: text(data, 'reason'), warnings });
      } catch (error) { if (!(error instanceof ApiClientError)) setValidation(error instanceof InvalidAppointmentTime ? error.message : errorMessage(error)); }
    }}>
      <fieldset disabled={preview.isPending || command.isPending}>
        <FormField label="חיפוש טכנאי" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <label className="form-field">טכנאי<select name="technician" required defaultValue=""><option value="">בחרו טכנאי פעיל</option>{(technicians.data ?? []).map((person) => <option value={person.id} key={person.id}>{person.display_name ?? 'טכנאי ללא שם'} · {`\u2066${person.phone_e164}\u2069`}</option>)}</select></label>
        {assignment ? <FormField label="סיבת שינוי השיבוץ" name="reason" minLength={3} maxLength={500} required /> : <>
          <FormField label="תחילת התיאום (שעון ישראל)" type="datetime-local" name="start" defaultValue={israelInput(service.preferred_window_start)} required />
          <FormField label="סיום התיאום (שעון ישראל)" type="datetime-local" name="end" defaultValue={israelInput(service.preferred_window_end)} required />
        </>}
        <button type="submit">{assignment ? 'סקירת שיבוץ' : 'סקירת תיאום'}</button>
      </fieldset>
    </form>
    {draft ? <div className="outcome"><p>{draft.technicianName} · {dateTime(draft.appointment.start)} – {dateTime(draft.appointment.end)}</p>
      {draft.warnings.length ? <><h3>חפיפות בתיאום</h3><ul>{draft.warnings.map((warning) => <li key={warning.request_id}>{warning.reference}: {dateTime(warning.start)} – {dateTime(warning.end)}</li>)}</ul>
        <label><input type="checkbox" checked={allow} onChange={(event) => setAllow(event.target.checked)} />  המשך למרות החפיפות בתיאום</label></> : null}
      {!draft.warnings.length || allow ? <ConfirmAction label={assignment ? 'שינוי טכנאי' : 'אישור תיאום'} recordLabel={service.reference}
        description={`${draft.technicianName} · ${dateTime(draft.appointment.start)} – ${dateTime(draft.appointment.end)}. ${assignment ? `${draft.reason}. הטכנאי הקודם יאבד גישה לבקשה.` : 'הפעולה מאשרת את המועד ומשבצת את הטכנאי.'}${allow ? ' החפיפות בתיאום נבדקו ואושרו.' : ''}`}
        onConfirm={async () => {
          await command.mutateAsync(assignment ? { technician_id: draft.appointment.technician_id, expected_technician_id: service.assigned_technician_id!, reason: draft.reason, allow_overlap: allow } : { ...draft.appointment, allow_overlap: allow });
          setDraft(null);
        }} /> : null}
    </div> : null}
  </section>;
}
