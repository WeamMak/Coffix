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
  return <section><h1>דגמי מכונות</h1><ConfigurationNav /><div className={edit !== undefined ? "list-editor-layout" : ""}><div className="list-panel no-caption"><div className="panel-heading"><h2>דגמי מכונות</h2><button className="primary" onClick={() => setEdit(null)}>דגם מכונה חדש</button></div>
    <DataTable caption="דגמי מכונות" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'דגם', render: (row) => `${row.manufacturer} ${row.model_name}` },
      { key: 'serial', label: 'כלל מספר סידורי', render: (row) => <bdi dir="ltr">{row.serial_pattern ?? 'ללא תבנית'}</bdi> },
      { key: 'warranty', label: 'חודשי אחריות', render: (row) => row.default_warranty_months },
      { key: 'active', label: 'פעילות', render: (row) => row.is_active ? 'פעיל' : 'לא פעיל' },
      { key: 'edit', label: 'פעולה', render: (row) => <button onClick={() => setEdit(row)}>עריכה {row.model_name}</button> },
    ]} />
    </div>{edit !== undefined ? <ModelEditor key={edit?.id ?? 'new'} item={edit} close={() => setEdit(undefined)} /> : null}
  </div></section>;
}
function ModelEditor({ item, close }: { item: Schema['MachineModelRead'] | null; close: () => void }) {
  const { client } = useWebSession();
  const save = useStaffSave((body: Schema['MachineModelCreate']) => client.api.request(`/admin/machine-models${item ? `/${item.id}` : ''}`, { method: item ? 'PATCH' : 'POST', body }), close);
  return <section className="editor-panel"><h2>{item ? `עריכת ${item.model_name}` : 'דגם מכונה חדש'}</h2><ProblemBanner error={save.error} />
    <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); save.mutate({ manufacturer: text(data, 'manufacturer'), model_name: text(data, 'name'), serial_pattern: optionalText(data, 'pattern'), default_warranty_months: Number(text(data, 'warranty')), is_active: data.has('active') }); }}>
      <fieldset disabled={save.isPending}><FormField label="יצרן" name="manufacturer" defaultValue={item?.manufacturer} maxLength={120} required />
        <FormField label="שם הדגם" name="name" defaultValue={item?.model_name} maxLength={120} required />
        <FormField label="תבנית מספר סידורי" name="pattern" defaultValue={item?.serial_pattern ?? ''} maxLength={255} />
        <FormField label="חודשי אחריות כברירת מחדל" name="warranty" type="number" min={0} step={1} required defaultValue={item?.default_warranty_months ?? 12} />
        <p>שינוי האחריות חל על רכישות עתידיות. מכונות שנרשמו ידנית אינן באחריות Coffix.</p>
        <label><input type="checkbox" name="active" defaultChecked={item?.is_active ?? true} />  פעיל</label>
        <div className="page-actions"><button type="submit">שמירת דגם מכונה</button><button type="button" onClick={close}>ביטול השינויים</button></div>
      </fieldset></form>
  </section>;
}
