import { ApiClientError } from '@coffix/api-client';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';
import { apiClient } from '../api/client';
import { pickServiceMedia } from '../features/media/picker';
import { discardServiceIssueMedia, uploadServiceIssueMedia, type MediaUploadHandle, type UploadMedia } from '../features/media/uploader';
import type { DraftMedia } from '../features/service/intakeStore';
import { spacing } from '../theme';

function MediaPreview({ item, index, scope }: { item: DraftMedia; index: number; scope: string }) {
  const query = useQuery({ queryKey: ['private', scope, 'media', item.id], queryFn: () => apiClient.request<{ url: string }>(`/api/v1/media/${encodeURIComponent(item.id)}/download`), enabled: !item.uri, staleTime: 0 });
  const uri = item.uri || query.data?.url;
  const [failed, setFailed] = useState(false);
  return <View style={{ gap: spacing.sm }}>
    {uri && !failed && item.contentType.startsWith('image/') ? <Image accessible accessibilityLabel={`צילום תקלה ${index + 1}`} source={{ uri }} style={{ width: 100, height: 100, borderRadius: 14 }} onError={() => setFailed(true)} /> : <Text>{`קובץ מצורף ${index + 1}`}</Text>}
    {!item.uri && query.isError ? <Button tone="soft" onPress={() => void query.refetch()}>טעינת קובץ מחדש</Button> : null}
    {uri ? <Button size="small" tone="soft" onPress={() => void Linking.openURL(uri).catch(() => setFailed(true))}>{`פתיחת קובץ ${index + 1}`}</Button> : null}
  </View>;
}

export function MediaGrid({ items, scope, collectionId, maxFiles = 5, maxImageBytes = 10485760, maxVideoBytes = 104857600, onChange, onBusy }: {
  items: DraftMedia[]; scope: string; collectionId?: string; maxFiles?: number; maxImageBytes?: number; maxVideoBytes?: number;
  onChange?: (items: DraftMedia[]) => Promise<void>; onBusy?: (busy: boolean) => void;
}) {
  const [pending, setPending] = useState<UploadMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const operation = useRef<MediaUploadHandle | null>(null);
  const active = useRef(true);
  const locked = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; operation.current?.cancel(); }; }, []);
  const markBusy = (value: boolean) => { locked.current = value; setBusy(value); onBusy?.(value); };
  const upload = async (file: UploadMedia) => {
    if (!collectionId || !onChange) return;
    setPending(file); setProgress(0);
    const handle = uploadServiceIssueMedia(file, collectionId, event => {
      if (active.current) setProgress(event.totalBytes ? Math.round(event.bytesSent / event.totalBytes * 100) : 0);
    });
    operation.current = handle;
    const id = await handle.result;
    if (active.current) { await onChange([...items, { id, uri: file.uri, contentType: file.contentType }]); setPending(null); }
  };
  const pick = async (kind: 'image' | 'video', camera = false) => {
    if (locked.current || items.length >= maxFiles) return;
    markBusy(true); setError('');
    try {
      const file = await pickServiceMedia(kind, camera ? 'camera' : 'library');
      if (!active.current || !file) return;
      const limit = kind === 'image' ? maxImageBytes : maxVideoBytes;
      if (file.sizeBytes <= 0 || file.sizeBytes > limit) throw new Error(`הקובץ חייב להיות עד ${Math.floor(limit / 1048576)} MB.`);
      await upload(file);
    } catch (err) { if (active.current) setError(err instanceof Error && /[א-ת]/.test(err.message) ? err.message : 'לא הצלחנו להעלות את הקובץ. בדקו הרשאות וחיבור ונסו שוב.'); }
    finally { if (active.current) markBusy(false); }
  };
  const remove = async (item: DraftMedia) => {
    if (!onChange || locked.current) return;
    markBusy(true); setError('');
    try {
      try { await discardServiceIssueMedia(item.id); }
      catch (err) { if (!(err instanceof ApiClientError) || err.problem.status !== 404) throw err; }
      await onChange(items.filter(media => media.id !== item.id));
    } catch { setError('לא הצלחנו להסיר את הקובץ. נסו שוב.'); }
    finally { if (active.current) markBusy(false); }
  };
  return <Card style={{ gap: spacing.md }}>
    <Text variant="label">צילומים ווידאו (אופציונלי)</Text>
    <Text>עד {maxFiles} קבצים · תמונה עד {Math.floor(maxImageBytes / 1048576)} MB · וידאו MP4 עד {Math.floor(maxVideoBytes / 1048576)} MB</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
      {items.map((item, index) => <View key={item.id}><MediaPreview item={item} index={index} scope={scope} />{onChange ? <Button disabled={busy} size="small" tone="soft" onPress={() => void remove(item)}>{`הסרת קובץ ${index + 1}`}</Button> : null}</View>)}
    </View>
    {onChange ? <>
      <Button tone="soft" disabled={busy || items.length >= maxFiles} onPress={() => void pick('image')}>בחירת תמונה</Button>
      <Button tone="soft" disabled={busy || items.length >= maxFiles} onPress={() => void pick('image', true)}>צילום תמונה</Button>
      <Button tone="soft" disabled={busy || items.length >= maxFiles} onPress={() => void pick('video')}>בחירת וידאו</Button>
    </> : null}
    {busy ? <><Text accessibilityLiveRegion="polite">מעלים קובץ {progress}%</Text><Button tone="soft" onPress={() => operation.current?.cancel()}>ביטול העלאה</Button></> : null}
    {error ? <Text accessibilityLiveRegion="polite">{error}</Text> : null}
    {pending && !busy ? <Button onPress={() => {
      if (locked.current) return;
      markBusy(true); setError('');
      void upload(pending).catch(() => setError('העלאת הקובץ נכשלה. נסו שוב.')).finally(() => { if (active.current) markBusy(false); });
    }}>ניסיון העלאה נוסף</Button> : null}
  </Card>;
}
