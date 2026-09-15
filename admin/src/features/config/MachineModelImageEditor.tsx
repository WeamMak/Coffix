import { SingleImageEditor } from '../catalog/CategoryImageEditor';
import type { Schema } from '../service/api';

export function MachineModelImageEditor({ model, disabled }: { model: Schema['MachineModelRead']; disabled?: boolean }) {
  return <SingleImageEditor purpose="machine_model" path={`/admin/machine-models/${model.id}`} imageUrl={model.image_url} mediaId={model.image_media_id} label={`${model.manufacturer} ${model.model_name}`} disabled={disabled} onSaved={() => undefined} />;
}
