import { useRef, useState } from 'react';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { dateTime, useStaffSave, type Schema } from './api';

export function ServiceMedia({ service, technician }: { service: Schema['StaffServiceRequestRead']; technician: boolean }) {
  const { client } = useWebSession();
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState('service_diagnosis');
  const [links, setLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const progress = useRef<{ target?: Schema['MediaUploadCreated']; uploaded?: boolean; mediaId?: string }>({});
  const input = useRef<HTMLInputElement>(null);
  const upload = useStaffSave(async () => {
    if (!file) return;
    const step = progress.current;
    step.target ??= await client.api.request<Schema['MediaUploadCreated']>('/media/uploads', { method: 'POST', body: { purpose, collection_id: service.id, content_type: file.type, size_bytes: file.size } });
    if (!step.uploaded) { await client.uploadFile(step.target, file); step.uploaded = true; }
    if (!step.mediaId) step.mediaId = (await client.api.request<Schema['MediaRead']>(`/media/uploads/${step.target.upload_id}/complete`, { method: 'POST' })).id;
    await client.api.request(`/technician/jobs/${service.id}/media`, { method: 'POST', body: { media_id: step.mediaId } });
  }, () => { setFile(null); progress.current = {}; if (input.current) input.current.value = ''; });
  async function open(mediaId: string) {
    setOpening(mediaId); setError(null);
    try { const download = await client.api.request<Schema['MediaDownload']>(`/media/${mediaId}/download`); setLinks((old) => ({ ...old, [mediaId]: download.url })); }
    catch (error) { setError(error); }
    finally { setOpening(null); }
  }
  return <section className="editor-panel"><h2>Job media</h2><ProblemBanner error={error ?? upload.error} />
    {service.media.length ? <ul>{service.media.map((item) => <li key={item.id}>{item.purpose} · {dateTime(item.created_at)} <button disabled={opening !== null} onClick={() => void open(item.media_id)}>Load {item.purpose} media</button>{links[item.media_id] && /^https?:\/\//i.test(links[item.media_id]) ? <a href={links[item.media_id]} target="_blank" rel="noopener noreferrer">Open {item.purpose} media</a> : null}</li>)}</ul> : <p>No media attached.</p>}
    {technician ? <form onSubmit={(event) => { event.preventDefault(); upload.mutate(); }}><fieldset disabled={upload.isPending}>
      <label className="form-field">Photo purpose<select value={purpose} onChange={(event) => { setPurpose(event.target.value); progress.current = {}; }}><option value="service_diagnosis">Diagnosis</option><option value="service_repair">Repair</option></select></label>
      <label className="form-field">Job photo<input ref={input} type="file" accept="image/jpeg,image/png,image/heic" onChange={(event) => { setFile(event.target.files?.[0] ?? null); progress.current = {}; }} /></label>
      <button type="submit" disabled={!file}>{upload.isPending ? 'Uploading photo…' : 'Upload job photo'}</button>
    </fieldset></form> : null}
  </section>;
}
