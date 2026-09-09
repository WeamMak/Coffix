import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { dateTime, text, useStaffQuery, useStaffSave, type Schema } from './api';
import { israelInput, israelInstant } from './time';

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
  return <section className="editor-panel"><h2>{assignment ? 'Change assignment' : 'Confirm appointment and assign technician'}</h2>
    <p>{assignment ? `Currently assigned: ${service.assigned_technician?.display_name ?? service.assigned_technician?.phone_e164 ?? 'Unassigned'}. The confirmed time stays the same.` : 'Preferred windows are requests. Confirm the actual appointment in Israel local time.'}</p>
    <ProblemBanner error={technicians.error ?? preview.error} />{validation ? <p role="alert">{validation}</p> : null}
    <form onChange={() => { setDraft(null); setAllow(false); }} onSubmit={async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setValidation('');
      try {
        const appointment = { allow_overlap: false, technician_id: text(data, 'technician'), start: assignment ? service.confirmed_appointment_start! : israelInstant(text(data, 'start')), end: assignment ? service.confirmed_appointment_end! : israelInstant(text(data, 'end')) };
        if (Date.parse(appointment.end) <= Date.parse(appointment.start)) { setValidation('Appointment end must follow start.'); return; }
        const warnings = await preview.mutateAsync(appointment);
        const technician = technicians.data?.find((item) => item.id === appointment.technician_id);
        setDraft({ appointment, technicianName: technician?.display_name ?? technician?.phone_e164 ?? appointment.technician_id, reason: text(data, 'reason'), warnings });
      } catch (error) { if (error instanceof Error && error.name !== 'ApiClientError') setValidation(error.message); }
    }}>
      <fieldset disabled={preview.isPending || command.isPending}>
        <FormField label="Find technician" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <label className="form-field">Technician<select name="technician" required defaultValue=""><option value="">Choose an active technician</option>{(technicians.data ?? []).map((person) => <option value={person.id} key={person.id}>{person.display_name ?? person.phone_e164} · {person.phone_e164}</option>)}</select></label>
        {assignment ? <FormField label="Assignment reason" name="reason" minLength={3} maxLength={500} required /> : <>
          <FormField label="Appointment start (Israel time)" type="datetime-local" name="start" defaultValue={israelInput(service.preferred_window_start)} required />
          <FormField label="Appointment end (Israel time)" type="datetime-local" name="end" defaultValue={israelInput(service.preferred_window_end)} required />
        </>}
        <button type="submit">{assignment ? 'Review assignment' : 'Review appointment'}</button>
      </fieldset>
    </form>
    {draft ? <div className="outcome"><p>{draft.technicianName} · {dateTime(draft.appointment.start)} – {dateTime(draft.appointment.end)}</p>
      {draft.warnings.length ? <><h3>Schedule overlaps</h3><ul>{draft.warnings.map((warning) => <li key={warning.request_id}>{warning.reference}: {dateTime(warning.start)} – {dateTime(warning.end)}</li>)}</ul>
        <label><input type="checkbox" checked={allow} onChange={(event) => setAllow(event.target.checked)} /> Continue despite schedule overlaps</label></> : null}
      {!draft.warnings.length || allow ? <ConfirmAction label={assignment ? 'Change technician' : 'Confirm appointment'} recordLabel={service.reference}
        description={`${draft.technicianName} · ${dateTime(draft.appointment.start)} – ${dateTime(draft.appointment.end)}. ${assignment ? `${draft.reason}. The previous technician loses access.` : 'This confirms the appointment and assigns the technician.'}${allow ? ' Schedule overlaps acknowledged.' : ''}`}
        onConfirm={async () => {
          await command.mutateAsync(assignment ? { technician_id: draft.appointment.technician_id, expected_technician_id: service.assigned_technician_id!, reason: draft.reason, allow_overlap: allow } : { ...draft.appointment, allow_overlap: allow });
          setDraft(null);
        }} /> : null}
    </div> : null}
  </section>;
}
