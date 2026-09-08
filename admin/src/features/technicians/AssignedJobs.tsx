import { Link, useSearchParams } from 'react-router-dom';
import { ProblemBanner } from '../../components/ProblemBanner';
import { StatusBadge } from '../../components/StatusBadge';
import { dateTime, label, serviceStates, useStaffQuery, type Schema } from '../service/api';

export function AssignedJobs() {
  const query = useStaffQuery<Schema['ServiceRequestRead'][]>('/technician/jobs', true);
  const [params, setParams] = useSearchParams();
  const state = params.get('state') ?? '';
  const jobs = (query.data ?? []).filter((job) => !state || job.state === state);
  return <section><h1>My jobs</h1><p>Service requests currently assigned to you.</p><ProblemBanner error={query.error} />
    <div className="list-filters"><label className="form-field">Job state<select value={state} onChange={(event) => setParams(event.target.value ? { state: event.target.value } : {})}><option value="">All assigned jobs</option>{serviceStates.map((state) => <option key={state} value={state}>{label(state)}</option>)}</select></label><button disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh jobs</button></div>
    {query.isPending ? <p role="status">Loading assigned jobs…</p> : query.error ? null : jobs.length ? <div className="job-grid">{jobs.map((job) => <article className="job-card" key={job.id}><h2><Link to={`/jobs/${job.id}`}>{job.reference}</Link></h2><StatusBadge label={label(job.state)} /><p dir="auto">{job.service_type_label_he}</p><p>{job.location_mode === 'pickup' ? 'Pickup' : 'Bring in to shop'}</p><p>{dateTime(job.confirmed_appointment_start)} – {dateTime(job.confirmed_appointment_end)}</p><p className="preserve-lines" dir="auto">{job.description}</p></article>)}</div> : <p className="empty-state">No assigned jobs match this view.</p>}
  </section>;
}
