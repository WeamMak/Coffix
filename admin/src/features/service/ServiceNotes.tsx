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
  return <section className="editor-panel"><h2>הערות שירות</h2>
    {service.notes.length ? <ul className="note-list">{service.notes.map((note) => <li key={note.id}><span className="status-badge">{note.visibility === 'customer' ? 'גלוי ללקוח' : 'פנימי — לצוות בלבד'}</span> · {dateTime(note.created_at)}<p className="preserve-lines" dir="auto">{note.body}</p></li>)}</ul> : <p>עדיין אין הערות.</p>}
    <ProblemBanner error={command.error} /><form onSubmit={(event) => { event.preventDefault(); command.mutate({ body: body.trim(), ...(technician ? {} : { visibility }) }); }}>
      <fieldset className="note-fields" disabled={command.isPending}><label className="form-field">הערה<textarea value={body} onChange={(event) => setBody(event.target.value)} required maxLength={4000} /></label>
        {technician ? <p>הערות טכנאי הן פנימיות וגלויות לצוות בלבד.</p> : <label className="form-field">למי ההערה גלויה<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="internal">פנימי — לצוות בלבד</option><option value="customer">גלוי ללקוח</option></select></label>}
        <button type="submit" disabled={!body.trim()}>הוספת הערה</button>
      </fieldset></form>
  </section>;
}
