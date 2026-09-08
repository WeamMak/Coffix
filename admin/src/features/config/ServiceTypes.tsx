import { useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { money, text, useStaffQuery, useStaffSave, type Schema } from '../service/api';
import { ConfigurationNav } from './ConfigurationNav';

const icons: Schema['ServiceTypeRead']['icon_key'][] = ['tool', 'sun', 'star', 'shield', 'info', 'droplet', 'settings', 'coffee', 'zap'];
export function ServiceTypes() {
  const query = useStaffQuery<Schema['ServiceTypeRead'][]>('/admin/service-types');
  const [edit, setEdit] = useState<Schema['ServiceTypeRead'] | null | undefined>();
  return <section><h1>Service types</h1><ConfigurationNav /><p>Starting prices are indicative. Diagnostic fees are quoted after intake review.</p>
    <button onClick={() => setEdit(null)}>New service type</button>
    <DataTable caption="Configured services" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'Service', render: (row) => <>{row.label_en}<br /><span dir="auto">{row.label_he}</span></> },
      { key: 'price', label: 'Starting price', render: (row) => money(row.diagnostic_fee_agorot) },
      { key: 'active', label: 'Visibility', render: (row) => row.is_active ? 'Active' : 'Inactive' },
      { key: 'edit', label: 'Action', render: (row) => <button onClick={() => setEdit(row)}>Edit {row.label_en}</button> },
    ]} />
    {edit !== undefined ? <ServiceTypeEditor key={edit?.id ?? 'new'} item={edit} close={() => setEdit(undefined)} /> : null}
  </section>;
}
function ServiceTypeEditor({ item, close }: { item: Schema['ServiceTypeRead'] | null; close: () => void }) {
  const { client } = useWebSession();
  const models = useStaffQuery<Schema['MachineModelRead'][]>('/admin/machine-models');
  const [draft, setDraft] = useState<Schema['ServiceTypeCreate'] | null>(null);
  const [validation, setValidation] = useState('');
  const save = useStaffSave((body: Schema['ServiceTypeCreate']) => client.api.request(`/admin/service-types${item ? `/${item.id}` : ''}`, { method: item ? 'PATCH' : 'POST', body: { ...body, ...(item ? { expected_version: item.version } : {}) } }), close);
  return <section className="editor-panel"><h2>{item ? `Edit ${item.label_en}` : 'New service type'}</h2><ProblemBanner error={models.error} />{validation ? <p role="alert">{validation}</p> : null}
    <form onChange={() => setDraft(null)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const tags = text(data, 'tags').split('\n').map((tag) => tag.trim()).filter(Boolean); const ids = data.getAll('model').map(String); setValidation('');
      if (!ids.length) { setValidation('Select at least one supported machine model.'); return; }
      if (tags.length > 8 || tags.some((tag) => tag.length > 60)) { setValidation('Use up to eight tags, each at most 60 characters.'); return; }
      const icon = icons.find((value) => value === text(data, 'icon')) ?? 'tool';
      setDraft({ label_he: text(data, 'label_he'), label_en: text(data, 'label_en'), icon_key: icon, tags_he: tags, diagnostic_fee_agorot: Number(text(data, 'price')), is_active: data.has('active'), machine_model_ids: ids });
    }}><fieldset disabled={save.isPending}>
      <FormField label="Hebrew service name" name="label_he" defaultValue={item?.label_he} required maxLength={160} dir="rtl" />
      <FormField label="English service name" name="label_en" defaultValue={item?.label_en} required maxLength={160} />
      <label className="form-field">Service icon<select name="icon" defaultValue={item?.icon_key ?? 'tool'}>{icons.map((icon) => <option value={icon} key={icon}>{icon}</option>)}</select></label>
      <label className="form-field">Hebrew tags (one per line)<textarea name="tags" dir="rtl" defaultValue={item?.tags_he.join('\n')} /></label>
      <FormField label="Starting price (agorot)" name="price" type="number" min={1} step={1} required defaultValue={item?.diagnostic_fee_agorot} />
      <label><input type="checkbox" name="active" defaultChecked={item?.is_active ?? true} /> Active</label>
      <fieldset><legend>Supported machine models</legend>{(models.data ?? []).map((model) => <label key={model.id}><input type="checkbox" name="model" value={model.id} defaultChecked={item?.machine_model_ids.includes(model.id)} /> {model.manufacturer} {model.model_name}{!model.is_active ? ' (inactive)' : ''}</label>)}</fieldset>
      <div className="page-actions"><button type="submit">Review service type</button><button type="button" onClick={close}>Discard edits</button></div>
    </fieldset></form>
    {draft ? <ConfirmAction label="Save service type" recordLabel={draft.label_en} amountAgorot={draft.diagnostic_fee_agorot} description="Apply service metadata and model mappings. This indicative starting price affects future intake choices; existing request fees stay unchanged." onConfirm={async () => { await save.mutateAsync(draft); }} /> : null}
  </section>;
}
