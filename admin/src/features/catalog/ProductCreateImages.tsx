import { ImageUpload, type UploadedImage } from '../../components/ImageUpload';

export type ProductCreateImage = UploadedImage & {
  alt_text_he: string;
  key: string;
};

type Props = {
  defaultAltText: string;
  disabled?: boolean;
  items: ProductCreateImage[];
  onBusyChange: (busy: boolean) => void;
  onChange: (items: ProductCreateImage[]) => void;
};

export function ProductCreateImages({
  defaultAltText,
  disabled,
  items,
  onBusyChange,
  onChange,
}: Props) {
  const change = (key: string, patch: Partial<ProductCreateImage>) => {
    onChange(items.map((item) => item.key === key ? { ...item, ...patch } : item));
  };
  const move = (index: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    if (item) next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <section className="editor-panel">
      <h2>תמונות המוצר</h2>
      <p>אפשר לבחור ולסדר תמונות עכשיו. שיוך למק״ט יהיה זמין לאחר שמירת המוצר.</p>
      <div className="image-gallery">
        {items.map((item, index) => (
          <article className="gallery-item" key={item.key}>
            <img className="image-preview" src={item.url} alt="תצוגה מקדימה של התמונה" />
            {index === 0 ? <span className="status-badge">תמונת שער</span> : null}
            <label className="form-field">
              תיאור בעברית
              <input
                aria-label={`תיאור תמונה ${index + 1}`}
                maxLength={300}
                value={item.alt_text_he}
                onChange={(event) => change(item.key, { alt_text_he: event.target.value })}
              />
            </label>
            <div className="page-actions">
              <button
                type="button"
                aria-label={`תמונת שער ${index + 1}`}
                disabled={index === 0 || disabled}
                onClick={() => move(index, 0)}
              >
                הגדרה כתמונת שער
              </button>
              <button
                type="button"
                aria-label={`הקדמת תמונה ${index + 1}`}
                disabled={index === 0 || disabled}
                onClick={() => move(index, index - 1)}
              >
                הקדמה
              </button>
              <button
                type="button"
                aria-label={`דחיית תמונה ${index + 1}`}
                disabled={index === items.length - 1 || disabled}
                onClick={() => move(index, index + 1)}
              >
                דחייה
              </button>
              <button
                type="button"
                aria-label={`הסרת תמונה ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange(items.filter(({ key }) => key !== item.key))}
              >
                הסרה
              </button>
            </div>
          </article>
        ))}
      </div>
      <ImageUpload
        disabled={disabled}
        onBusyChange={onBusyChange}
        onUploaded={(image) => onChange([
          ...items,
          {
            ...image,
            alt_text_he: defaultAltText.trim(),
            key: image.media_id,
          },
        ])}
        purpose="product"
        retainedIds={[]}
      />
    </section>
  );
}
