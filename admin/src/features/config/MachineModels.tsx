import { useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { optionalText, text, useStaffQuery, useStaffSave, type Schema } from '../service/api';
import { ConfigurationNav } from './ConfigurationNav';

export function MachineModels() {
  const query = useStaffQuery<Schema['MachineModelRead'][]>('/admin/machine-models');
  const [edit, setEdit] = useState<Schema['MachineModelRead'] | null | undefined>();
  return <section><h1>Machine models</h1><ConfigurationNav /><button onClick={() => setEdit(null)}>New machine model</button>
    <DataTable caption="Machine models" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'Model', render: (row) => `${row.manufacturer} ${row.model_name}` },
      { key: 'serial', label: 'Serial rule', render: (row) => row.serial_pattern ?? 'No pattern' },
      { key: 'warranty', label: 'Warranty months', render: (row) => row.default_warranty_months },
      { key: 'active', label: 'Visibility', render: (row) => row.is_active ? 'Active' : 'Inactive' },
      { key: 'edit', label: 'Action', render: (row) => <button onClick={() => setEdit(row)}>Edit {row.model_name}</button> },
    ]} />
    {edit !== undefined ? <ModelEditor key={edit?.id ?? 'new'} item={edit} close={() => setEdit(undefined)} /> : null}
  </section>;
}
function ModelEditor({ item, close }: { item: Schema['MachineModelRead'] | null; close: () => void }) {
  const { client } = useWebSession();
  const save = useStaffSave((body: Schema['MachineModelCreate']) => client.api.request(`/admin/machine-models${item ? `/${item.id}` : ''}`, { method: item ? 'PATCH' : 'POST', body }), close);
  return <section className="editor-panel"><h2>{item ? `Edit ${item.model_name}` : 'New machine model'}</h2><ProblemBanner error={save.error} />
    <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); save.mutate({ manufacturer: text(data, 'manufacturer'), model_name: text(data, 'name'), serial_pattern: optionalText(data, 'pattern'), default_warranty_months: Number(text(data, 'warranty')), is_active: data.has('active') }); }}>
      <fieldset disabled={save.isPending}><FormField label="Manufacturer" name="manufacturer" defaultValue={item?.manufacturer} maxLength={120} required />
        <FormField label="Model name" name="name" defaultValue={item?.model_name} maxLength={120} required />
        <FormField label="Serial pattern" name="pattern" defaultValue={item?.serial_pattern ?? ''} maxLength={255} />
        <FormField label="Default warranty months" name="warranty" type="number" min={0} step={1} required defaultValue={item?.default_warranty_months ?? 12} />
        <p>Warranty changes apply to future purchases. Manual registrations have no Coffix warranty.</p>
        <label><input type="checkbox" name="active" defaultChecked={item?.is_active ?? true} /> Active</label>
        <div className="page-actions"><button type="submit">Save machine model</button><button type="button" onClick={close}>Discard edits</button></div>
      </fieldset></form>
  </section>;
}
