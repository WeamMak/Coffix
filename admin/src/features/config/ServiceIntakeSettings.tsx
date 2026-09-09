import { useState } from 'react';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { useStaffQuery, useStaffSave, type Schema } from '../service/api';
import { ConfigurationNav } from './ConfigurationNav';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function ServiceIntakeSettings() {
  const query = useStaffQuery<Schema['IntakeSettings']>('/admin/service-intake-settings');
  const [revision, setRevision] = useState(0);
  return <section><h1>Service intake settings</h1><ConfigurationNav /><ProblemBanner error={query.error} />
    <button disabled={query.isFetching} onClick={async () => { const result = await query.refetch(); if (result.isSuccess) setRevision((value) => value + 1); }}>Reload settings and discard edits</button>
    {query.data ? <IntakeEditor key={revision} initial={query.data} /> : query.isPending ? <p role="status">Loading settings…</p> : null}
  </section>;
}
function IntakeEditor({ initial }: { initial: Schema['IntakeSettings'] }) {
  const { client } = useWebSession();
  const [draft, setDraft] = useState(initial);
  const [review, setReview] = useState(false);
  const [validation, setValidation] = useState('');
  const [saved, setSaved] = useState(false);
  const save = useStaffSave(async () => { const result = await client.api.request<Schema['IntakeSettings']>('/admin/service-intake-settings', { method: 'PUT', body: draft }); setDraft(result); setReview(false); setSaved(true); });
  return <section className="editor-panel"><p>Preferred slots use Asia/Jerusalem. Urgency and response expectations are snapshotted when a request is submitted.</p>
    {saved ? <p role="status">Intake settings saved.</p> : null}{validation ? <p role="alert">{validation}</p> : null}
    <form onChange={() => { setReview(false); setSaved(false); }} onSubmit={(event) => {
      event.preventDefault(); setValidation('');
      if (new Set(draft.urgencies.map((item) => item.id)).size !== draft.urgencies.length) { setValidation('Urgency IDs must be unique.'); return; }
      const slots = [...draft.slots].sort((a, b) => a.start.localeCompare(b.start));
      if (slots.some((slot, index) => slot.end <= slot.start || index > 0 && slots[index - 1].end > slot.start)) { setValidation('Time slots must end after they start and must not overlap.'); return; }
      setReview(true);
    }}><fieldset disabled={save.isPending}>
      <h2>Urgency options</h2>{draft.urgencies.map((urgency, index) => <fieldset className="config-row" key={index}><legend>Urgency {index + 1}</legend>
        <FormField label={`Urgency ${index + 1} ID`} value={urgency.id} pattern="[a-z][a-z0-9_-]{0,39}" required onChange={(event) => setDraft({ ...draft, urgencies: draft.urgencies.map((item, i) => i === index ? { ...item, id: event.target.value } : item) })} />
        <FormField label={`Urgency ${index + 1} Hebrew name`} value={urgency.name_he} maxLength={80} required dir="rtl" onChange={(event) => setDraft({ ...draft, urgencies: draft.urgencies.map((item, i) => i === index ? { ...item, name_he: event.target.value } : item) })} />
        <FormField label={`Urgency ${index + 1} Hebrew description`} value={urgency.description_he} maxLength={160} required dir="rtl" onChange={(event) => setDraft({ ...draft, urgencies: draft.urgencies.map((item, i) => i === index ? { ...item, description_he: event.target.value } : item) })} />
        <FormField label={`Urgency ${index + 1} surcharge (%)`} type="number" min={0} max={1000} step={1} required value={urgency.surcharge_percent} onChange={(event) => setDraft({ ...draft, urgencies: draft.urgencies.map((item, i) => i === index ? { ...item, surcharge_percent: Number(event.target.value) } : item) })} />
        <button type="button" disabled={draft.urgencies.length === 1} onClick={() => { setDraft({ ...draft, urgencies: draft.urgencies.filter((_, i) => i !== index) }); setReview(false); }}>Remove urgency {index + 1}</button>
      </fieldset>)}
      <button type="button" disabled={draft.urgencies.length >= 12} onClick={() => { setDraft({ ...draft, urgencies: [...draft.urgencies, { id: '', name_he: '', description_he: '', surcharge_percent: 0 }] }); setReview(false); }}>Add urgency</button>
      <fieldset><legend>Available weekdays</legend>{weekdays.map((day, index) => <label key={day}><input type="checkbox" checked={draft.weekdays.includes(index)} onChange={(event) => setDraft({ ...draft, weekdays: event.target.checked ? [...draft.weekdays, index].sort() : draft.weekdays.filter((value) => value !== index) })} /> {day}</label>)}</fieldset>
      <h2>Preferred time slots</h2>{draft.slots.map((slot, index) => <fieldset className="config-row" key={index}><legend>Slot {index + 1}</legend>
        <FormField label={`Slot ${index + 1} start`} type="time" required value={slot.start} onChange={(event) => setDraft({ ...draft, slots: draft.slots.map((item, i) => i === index ? { ...item, start: event.target.value } : item) })} />
        <FormField label={`Slot ${index + 1} end`} type="time" required value={slot.end} onChange={(event) => setDraft({ ...draft, slots: draft.slots.map((item, i) => i === index ? { ...item, end: event.target.value } : item) })} />
        <button type="button" onClick={() => { setDraft({ ...draft, slots: draft.slots.filter((_, i) => i !== index) }); setReview(false); }}>Remove slot {index + 1}</button>
      </fieldset>)}
      <button type="button" disabled={draft.slots.length >= 12} onClick={() => { setDraft({ ...draft, slots: [...draft.slots, { start: '', end: '' }] }); setReview(false); }}>Add time slot</button>
      <FormField label="Booking horizon (days)" type="number" min={1} max={60} step={1} required value={draft.horizon_days} onChange={(event) => setDraft({ ...draft, horizon_days: Number(event.target.value) })} />
      <FormField label="Expected response hours" type="number" min={1} max={168} step={1} required value={draft.response_hours} onChange={(event) => setDraft({ ...draft, response_hours: Number(event.target.value) })} />
      <button type="submit">Review intake settings</button>
    </fieldset></form>
    {review ? <ConfirmAction label="Save intake settings" recordLabel={`Service intake, version ${draft.version}`} description={`Apply ${draft.urgencies.length} urgency options, ${draft.weekdays.map((day) => weekdays[day]).join(', ') || 'no weekdays'}, ${draft.slots.length} time slots, ${draft.horizon_days} booking days and ${draft.response_hours} response hours to future requests. Existing fee and urgency snapshots remain unchanged.`} onConfirm={async () => { await save.mutateAsync(); }} /> : null}
  </section>;
}
