import { useState } from 'react';
import { ConfirmAction } from '../../components/ConfirmAction';
import { ImageUpload } from '../../components/ImageUpload';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { useAdminQuery, useCommerceSave, type Schema } from './api';

type Item = Schema['ProductImageInput'] & { url: string; key: string };
type Props = { product: Schema['AdminProductRead']; onVersion: (version: string) => void; disabled?: boolean };
export function ProductImagesEditor(props: Props) {
  const query = useAdminQuery<Schema['ProductGalleryRead']>(`/admin/products/${props.product.id}/media`);
  if (query.isPending) return <p role="status">טוענים תמונות…</p>;
  if (!query.data) return <ProblemBanner error={query.error} />;
  return <Gallery {...props} initial={query.data} />;
}
function Gallery({ product, onVersion, disabled, initial }: Props & { initial: Schema['ProductGalleryRead'] }) {
  const { client } = useWebSession();
  const toDraft = (gallery: Schema['ProductGalleryRead']): Item[] => (gallery.items ?? []).map((item) => ({ id: item.id, sku_id: item.sku_id, alt_text_he: item.alt_text_he, url: item.url, key: item.id }));
  const [items, setItems] = useState(() => toDraft(initial));
  const [retained, setRetained] = useState<string[]>(() => (initial.items ?? []).flatMap((item) => item.media_id ? [item.media_id] : []));
  const [version, setVersion] = useState(initial.version);
  const [uploadsInProgress, setUploadsInProgress] = useState(0);
  const [previousVersion, setPreviousVersion] = useState(product.version);
  // Only acknowledged metadata/image writes from this editor advance the token.
  if (product.version !== previousVersion) { setPreviousVersion(product.version); setVersion(product.version); }
  const path = `/admin/products/${product.id}/media`;
  const save = useCommerceSave(async () => {
    const result = await client.api.request<Schema['ProductGalleryRead']>(path, { method: 'PUT', body: {
      version, items: items.map(({ id, media_id, sku_id, alt_text_he }) => ({ id, media_id, sku_id, alt_text_he })),
    } });
    setItems(toDraft(result)); setVersion(result.version);
    setRetained(result.items.flatMap((item) => item.media_id ? [item.media_id] : [])); onVersion(result.version);
  });
  const uploadBusy = (busy: boolean) => setUploadsInProgress((count) => Math.max(0, count + (busy ? 1 : -1)));
  const change = (key: string, patch: Partial<Item>) => {
    save.reset();
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  };
  function move(index: number, to: number) {
    save.reset();
    setItems((current) => { const next = [...current]; const [item] = next.splice(index, 1); if (item) next.splice(to, 0, item); return next; });
  }
  return <section className="editor-panel"><h2>תמונות המוצר</h2><p>התמונה הראשונה היא תמונת השער. השינויים נשמרים יחד.</p>
    <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><fieldset disabled={save.isPending || uploadsInProgress > 0 || disabled}>
      <div className="image-gallery">{items.map((item, index) => <article className="gallery-item" key={item.key}>
        <img className="image-preview" src={item.url} alt={item.alt_text_he || `תמונה ${index + 1}`} />
        {index === 0 ? <span className="status-badge">תמונת שער</span> : null}
        <label className="form-field">תיאור בעברית<input aria-label={`תיאור תמונה ${index + 1}`} required pattern=".*\S.*" maxLength={300} value={item.alt_text_he} onChange={(event) => change(item.key, { alt_text_he: event.target.value })} /></label>
        <label className="form-field">שיוך למק״ט<select aria-label={`מק״ט לתמונה ${index + 1}`} value={item.sku_id ?? ''} onChange={(event) => change(item.key, { sku_id: event.target.value || null })}><option value="">כל המק״טים</option>{product.skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.sku_code}</option>)}</select></label>
        <div className="page-actions"><button type="button" disabled={index === 0} aria-label={`תמונת שער ${index + 1}`} onClick={() => move(index, 0)}>הגדרה כתמונת שער</button><button type="button" disabled={index === 0} aria-label={`הקדמת תמונה ${index + 1}`} onClick={() => move(index, index - 1)}>הקדמה</button><button type="button" disabled={index === items.length - 1} aria-label={`דחיית תמונה ${index + 1}`} onClick={() => move(index, index + 1)}>דחייה</button></div>
        <details><summary>החלפת תמונה</summary><ImageUpload purpose="product" retainedIds={retained} disabled={save.isPending || disabled} onBusyChange={uploadBusy} onUploaded={(image) => change(item.key, image)} /></details>
        <ConfirmAction label={`הסרת תמונה ${index + 1}`} recordLabel={item.alt_text_he} description="התמונה תוסר מהגלריה בשמירה הבאה." onConfirm={async () => { save.reset(); setItems((current) => current.filter((row) => row.key !== item.key)); }} />
      </article>)}</div>
      <ImageUpload purpose="product" retainedIds={retained} disabled={save.isPending || disabled} onBusyChange={uploadBusy} onUploaded={(image) => { save.reset(); setItems((current) => [...current, { ...image, key: image.media_id, alt_text_he: product.name_he, sku_id: null }]); }} />
      <button className="primary" type="submit">שמירת גלריה</button>
    </fieldset></form><ProblemBanner error={save.error} />
    {save.isSuccess ? <p role="status">הגלריה נשמרה.</p> : null}
    {save.isError ? <button type="button" onClick={async () => {
      const result = await client.api.request<Schema['ProductGalleryRead']>(path);
      setItems(toDraft(result)); setVersion(result.version); onVersion(result.version); save.reset();
    }}>טעינת הגלריה מחדש וביטול שינויי התמונות</button> : null}
  </section>;
}
