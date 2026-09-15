import { useState } from 'react';
import { ImageUpload, type UploadedImage } from '../../components/ImageUpload';
import { ConfirmAction } from '../../components/ConfirmAction';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { useStaffSave, type Schema } from '../service/api';

// Single-image commands share the same draft and lifecycle for models and categories.
export function SingleImageEditor({ purpose, path, imageUrl, mediaId, version, label, onSaved, disabled }: {
  purpose: 'category' | 'machine_model'; path: string; imageUrl?: string | null; mediaId?: string | null;
  version?: string; label: string; onSaved: (result: Schema['AdminCategoryRead'] | Schema['MachineModelRead']) => void; disabled?: boolean;
}) {
  const { client } = useWebSession();
  const [current, setCurrent] = useState({ url: imageUrl, mediaId, version });
  const [draft, setDraft] = useState<UploadedImage>();
  const [uploading, setUploading] = useState(false);
  const save = useStaffSave(async (id: string | null) => {
    const result = await client.api.request<Schema['AdminCategoryRead'] | Schema['MachineModelRead']>(path, {
      method: 'PATCH', body: { image_media_id: id, ...(current.version ? { version: current.version } : {}) },
    });
    if (id && draft?.media_id === id) draft.retain();
    setCurrent({ url: result.image_url, mediaId: result.image_media_id, version: 'version' in result ? result.version : undefined });
    setDraft(undefined); onSaved(result);
  });
  return <section className="image-editor"><h3>תמונה</h3>
    {draft?.url || current.url ? <img className="image-preview" src={draft?.url ?? current.url ?? undefined} alt={draft ? 'תצוגה מקדימה של התמונה' : label} /> : <p>לא נבחרה תמונה.</p>}
    <fieldset disabled={save.isPending || uploading || disabled}>
      <ImageUpload purpose={purpose} retainedIds={current.mediaId ? [current.mediaId] : []} onBusyChange={setUploading} onUploaded={(image) => { setDraft(image); save.reset(); }} disabled={save.isPending || disabled} />
      {draft ? <button type="button" onClick={() => save.mutate(draft.media_id)}>שמירת תמונה</button> : null}
      {current.url ? <ConfirmAction label="הסרת תמונה" recordLabel={label} description="התמונה תוסר מהרשומה לאחר האישור." onConfirm={async () => { await save.mutateAsync(null); }} /> : null}
    </fieldset><ProblemBanner error={save.error} />
    {save.isSuccess ? <p role="status">התמונה נשמרה.</p> : null}
    {save.isError && purpose === 'category' ? <button type="button" onClick={async () => {
      let item: Schema['AdminCategoryRead'] | undefined;
      for (let page = 1; !item; page++) {
        const items = await client.api.request<Schema['AdminCategoryRead'][]>(`/admin/categories?limit=100&page=${page}`);
        item = items.find((item) => path.endsWith(`/${item.id}`));
        if (items.length < 100) break;
      }
      if (item) { setCurrent({ url: item.image_url, mediaId: item.image_media_id, version: item.version }); onSaved(item); save.reset(); }
    }}>טעינת גרסה עדכנית לתמונה ושמירת הטיוטה</button> : null}
  </section>;
}

export function CategoryImageEditor({ category, onSaved, disabled }: { category: Schema['AdminCategoryRead']; onSaved: (item: Schema['AdminCategoryRead']) => void; disabled?: boolean }) {
  return <SingleImageEditor purpose="category" path={`/admin/categories/${category.id}`} imageUrl={category.image_url} mediaId={category.image_media_id} version={category.version} label={category.name_he} disabled={disabled} onSaved={(item) => { if ('version' in item) onSaved(item); }} />;
}
