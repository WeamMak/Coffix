import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { components } from '@coffix/api-client';
import { useWebSession } from '../features/auth/useWebSession';
import { ProblemBanner } from './ProblemBanner';

export type UploadedImage = { media_id: string; url: string };
type Purpose = Extract<components['schemas']['MediaPurpose'], 'category' | 'machine_model' | 'product'>;

export function ImageUpload({ purpose, retainedIds, onUploaded, onBusyChange, disabled = false }: {
  purpose: Purpose; retainedIds: readonly string[]; onUploaded: (image: UploadedImage) => void;
  onBusyChange?: (busy: boolean) => void; disabled?: boolean;
}) {
  const { client } = useWebSession();
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<unknown>();
  const [invalid, setInvalid] = useState('');
  const uploaded = useRef(new Set<string>());
  const attached = useRef(retainedIds);
  useLayoutEffect(() => { attached.current = retainedIds; }, [retainedIds]);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const owned = uploaded.current;
    return () => {
      active.current = false;
      for (const id of owned) {
        if (!attached.current.includes(id)) void client.api.request(`/media/${id}`, { method: 'DELETE' }).catch(() => undefined);
      }
    };
  }, [client]);

  async function upload(selected: File) {
    if (busy || disabled) return;
    setFile(selected); setError(undefined); setInvalid('');
    if (!['image/jpeg', 'image/png'].includes(selected.type) || selected.size === 0) {
      setInvalid('בחרו תמונת JPEG או PNG תקינה.'); return;
    }
    setBusy(true); onBusyChange?.(true); setStage('מכינים העלאה…');
    try {
      const target = await client.api.request<components['schemas']['MediaUploadCreated']>('/media/uploads', {
        method: 'POST', body: { purpose, content_type: selected.type, size_bytes: selected.size },
      });
      setStage('מעלים תמונה…');
      await client.uploadFile(target, selected);
      setStage('מאמתים תמונה…');
      const media = await client.api.request<components['schemas']['MediaRead']>(`/media/uploads/${target.upload_id}/complete`, { method: 'POST' });
      uploaded.current.add(media.id);
      if (!active.current) { await client.api.request(`/media/${media.id}`, { method: 'DELETE' }); return; }
      const download = await client.api.request<components['schemas']['MediaDownload']>(`/media/${media.id}/download`);
      if (active.current) onUploaded({ media_id: media.id, url: download.url });
      else await client.api.request(`/media/${media.id}`, { method: 'DELETE' });
    } catch (failure) { if (active.current) setError(failure); }
    finally {
      if (active.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }
  return <div className="image-upload">
    <label className="file-picker">בחירת תמונה<input aria-label="בחירת תמונה" type="file" accept="image/jpeg,image/png" disabled={busy || disabled} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void upload(selected); event.target.value = ''; }} /></label>
    {file ? <bdi>{file.name}</bdi> : null}
    {busy ? <div role="status"><progress aria-label="התקדמות העלאה" /> {stage}</div> : null}
    {invalid ? <p role="alert">{invalid}</p> : null}
    <ProblemBanner error={error} />
    {error && file ? <button type="button" disabled={busy || disabled} onClick={() => void upload(file)}>ניסיון העלאה נוסף</button> : null}
  </div>;
}
