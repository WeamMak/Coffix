import { useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { IconPicker, serviceIcons } from '../../components/IconPicker';
import { useWebSession } from '../auth/useWebSession';
import { money, text, useStaffQuery, useStaffSave, type Schema } from '../service/api';
import { ConfigurationNav } from './ConfigurationNav';

export function ServiceTypes() {
  const query = useStaffQuery<Schema['ServiceTypeRead'][]>('/admin/service-types');
  const [edit, setEdit] = useState<Schema['ServiceTypeRead'] | null | undefined>();
  return <section><h1>סוגי שירות</h1><ConfigurationNav /><p>המחירים ההתחלתיים הם הערכה בלבד. דמי האבחון נקבעים לאחר בדיקת הפנייה.</p>
    <div className={edit !== undefined ? "list-editor-layout" : ""}><div className="list-panel no-caption"><div className="panel-heading"><h2>סוגי שירות</h2><button className="primary" onClick={() => setEdit(null)}>סוג שירות חדש</button></div>
    <DataTable caption="סוגי השירות המוגדרים" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'שירות', render: (row) => <><span dir="auto">{row.label_he}</span><br /><bdi dir="ltr">{row.label_en}</bdi></> },
      { key: 'price', label: 'מחיר התחלתי', render: (row) => money(row.diagnostic_fee_agorot) },
      { key: 'active', label: 'פעילות', render: (row) => row.is_active ? 'פעיל' : 'לא פעיל' },
      { key: 'edit', label: 'פעולה', render: (row) => <button onClick={() => setEdit(row)}>עריכה {row.label_he}</button> },
    ]} />
    </div>{edit !== undefined ? <ServiceTypeEditor key={edit?.id ?? 'new'} item={edit} close={() => setEdit(undefined)} /> : null}
  </div></section>;
}
function ServiceTypeEditor({ item, close }: { item: Schema['ServiceTypeRead'] | null; close: () => void }) {
  const { client } = useWebSession();
  const models = useStaffQuery<Schema['MachineModelRead'][]>('/admin/machine-models');
  const [draft, setDraft] = useState<Schema['ServiceTypeCreate'] | null>(null);
  const [validation, setValidation] = useState('');
  const save = useStaffSave((body: Schema['ServiceTypeCreate']) => client.api.request(`/admin/service-types${item ? `/${item.id}` : ''}`, { method: item ? 'PATCH' : 'POST', body: { ...body, ...(item ? { expected_version: item.version } : {}) } }), close);
  return <section className="editor-panel"><h2>{item ? `עריכת ${item.label_he}` : 'סוג שירות חדש'}</h2><ProblemBanner error={models.error} />{validation ? <p role="alert">{validation}</p> : null}
    <form onChange={() => setDraft(null)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const tags = text(data, 'tags').split('\n').map((tag) => tag.trim()).filter(Boolean); const ids = data.getAll('model').map(String); setValidation('');
      if (!ids.length) { setValidation('יש לבחור לפחות דגם מכונה נתמך אחד.'); return; }
      if (tags.length > 8 || tags.some((tag) => tag.length > 60)) { setValidation('ניתן להזין עד שמונה תגיות, עד 60 תווים לכל תגית.'); return; }
      const icon = serviceIcons.find((value) => value === text(data, 'icon')) ?? 'tool';
      setDraft({ label_he: text(data, 'label_he'), label_en: text(data, 'label_en'), icon_key: icon, tags_he: tags, diagnostic_fee_agorot: Number(text(data, 'price')), is_active: data.has('active'), machine_model_ids: ids });
    }}><fieldset disabled={save.isPending}>
      <FormField label="שם השירות בעברית" name="label_he" defaultValue={item?.label_he} required maxLength={160} dir="rtl" />
      <FormField label="שם השירות באנגלית" name="label_en" defaultValue={item?.label_en} required maxLength={160} />
      <IconPicker label="סמל שירות" name="icon" choices={serviceIcons} initialValue={item?.icon_key} />
      <label className="form-field">תגיות בעברית (אחת בכל שורה)<textarea name="tags" dir="rtl" defaultValue={item?.tags_he.join('\n')} /></label>
      <FormField label="מחיר התחלתי באגורות" name="price" type="number" min={1} step={1} required defaultValue={item?.diagnostic_fee_agorot} />
      <label><input type="checkbox" name="active" defaultChecked={item?.is_active ?? true} />  פעיל</label>
      <fieldset><legend>דגמי מכונות נתמכים</legend>{(models.data ?? []).map((model) => <label key={model.id}><input type="checkbox" name="model" value={model.id} defaultChecked={item?.machine_model_ids.includes(model.id)} /> {model.manufacturer} {model.model_name}{!model.is_active ? ' (לא פעיל)' : ''}</label>)}</fieldset>
      <div className="page-actions"><button type="submit">סקירת סוג השירות</button><button type="button" onClick={close}>ביטול השינויים</button></div>
    </fieldset></form>
    {draft ? <ConfirmAction label="שמירת סוג שירות" recordLabel={draft.label_he} amountAgorot={draft.diagnostic_fee_agorot} description="שמירת פרטי השירות והדגמים הנתמכים. המחיר ההתחלתי הוא הערכה לבקשות עתידיות; החיובים בבקשות קיימות אינם משתנים." onConfirm={async () => { await save.mutateAsync(draft); }} /> : null}
  </section>;
}
