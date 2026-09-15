import { ImageUpload, type UploadedImage } from './ImageUpload';

type Props = {
  disabled?: boolean;
  label: string;
  onBusyChange: (busy: boolean) => void;
  onChange: (image: UploadedImage | undefined) => void;
  purpose: 'category' | 'machine_model';
  value?: UploadedImage;
};

export function SingleImageDraftField({
  disabled,
  label,
  onBusyChange,
  onChange,
  purpose,
  value,
}: Props) {
  return (
    <section className="image-editor">
      <h3>תמונה</h3>
      {value ? (
        <img className="image-preview" src={value.url} alt="תצוגה מקדימה של התמונה" />
      ) : (
        <p>לא נבחרה תמונה.</p>
      )}
      <ImageUpload
        disabled={disabled}
        onBusyChange={onBusyChange}
        onUploaded={onChange}
        purpose={purpose}
        retainedIds={[]}
      />
      {value ? (
        <button type="button" aria-label={`הסרת תמונת ${label}`} onClick={() => onChange(undefined)}>
          הסרת התמונה שנבחרה
        </button>
      ) : null}
    </section>
  );
}
