import { useRef, useState } from 'react';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { dateTime, label, useStaffSave, type Schema } from './api';

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
  return <section className="editor-panel"><h2>קבצים מצורפים</h2><ProblemBanner error={error ?? upload.error} />
    {service.media.length ? <ul>{service.media.map((item) => <li key={item.id}>{label(item.purpose)} · {dateTime(item.created_at)} <button disabled={opening !== null} onClick={() => void open(item.media_id)}>טעינת קובץ {label(item.purpose)}</button>{links[item.media_id] && /^https?:\/\//i.test(links[item.media_id]) ? <a href={links[item.media_id]} target="_blank" rel="noopener noreferrer">פתיחת קובץ {label(item.purpose)}</a> : null}</li>)}</ul> : <p>לא צורפו קבצים.</p>}
    {technician ? <form onSubmit={(event) => { event.preventDefault(); upload.mutate(); }}><fieldset disabled={upload.isPending}>
      <label className="form-field">מטרת התמונה<select value={purpose} onChange={(event) => { setPurpose(event.target.value); progress.current = {}; }}><option value="service_diagnosis">אבחון</option><option value="service_repair">תיקון</option></select></label>
      <label className="form-field">תמונת עבודה<span className="file-picker"><span className="file-picker-button" aria-hidden="true">בחירת תמונה</span><bdi>{file?.name ?? 'לא נבחרה תמונה'}</bdi><input ref={input} type="file" aria-label="תמונת עבודה" accept="image/jpeg,image/png,image/heic" onChange={(event) => { setFile(event.target.files?.[0] ?? null); progress.current = {}; }} /></span></label>
      <button type="submit" disabled={!file}>{upload.isPending ? 'מעלים תמונה…' : 'העלאת תמונת עבודה'}</button>
    </fieldset></form> : null}
  </section>;
}
