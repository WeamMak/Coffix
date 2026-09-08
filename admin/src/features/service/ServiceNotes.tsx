import { useState } from 'react';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { dateTime, useStaffSave, type Schema } from './api';

export function ServiceNotes({ service, technician }: { service: Schema['StaffServiceRequestRead']; technician: boolean }) {
  const { client } = useWebSession();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState('internal');
  const prefix = technician ? `/technician/jobs/${service.id}` : `/admin/service-requests/${service.id}`;
  const command = useStaffSave((body: unknown) => client.api.request(`${prefix}/notes`, { method: 'POST', body }), () => setBody(''));
  return <section className="editor-panel"><h2>Service notes</h2>
    {service.notes.length ? <ul className="note-list">{service.notes.map((note) => <li key={note.id}><strong>{note.visibility === 'customer' ? 'Customer visible' : 'Internal — staff only'}</strong> · {dateTime(note.created_at)}<p className="preserve-lines" dir="auto">{note.body}</p></li>)}</ul> : <p>No notes yet.</p>}
    <ProblemBanner error={command.error} /><form onSubmit={(event) => { event.preventDefault(); command.mutate({ body: body.trim(), ...(technician ? {} : { visibility }) }); }}>
      <fieldset disabled={command.isPending}><label className="form-field">Note<textarea value={body} onChange={(event) => setBody(event.target.value)} required maxLength={4000} /></label>
        {technician ? <p>Technician notes are internal and visible only to staff.</p> : <label className="form-field">Note visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="internal">Internal — staff only</option><option value="customer">Customer visible</option></select></label>}
        <button type="submit" disabled={!body.trim()}>Add note</button>
      </fieldset></form>
  </section>;
}
