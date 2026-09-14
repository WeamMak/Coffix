import { useState } from 'react';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { useStaffQuery, useStaffSave, type Schema } from '../service/api';
import { ConfigurationNav } from './ConfigurationNav';

const weekdays = ['יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'יום שבת', 'יום ראשון'];
export function ServiceIntakeSettings() {
  const query = useStaffQuery<Schema['IntakeSettings']>('/admin/service-intake-settings');
  const [revision, setRevision] = useState(0);
  return <section><h1>הגדרות קבלת שירות</h1><ConfigurationNav /><ProblemBanner error={query.error} />
    <button disabled={query.isFetching} onClick={async () => { const result = await query.refetch(); if (result.isSuccess) setRevision((value) => value + 1); }}>טעינת ההגדרות מחדש וביטול השינויים</button>
    {query.data ? <IntakeEditor key={revision} initial={query.data} /> : query.isPending ? <p role="status">טוענים הגדרות…</p> : null}
  </section>;
}
function IntakeEditor({ initial }: { initial: Schema['IntakeSettings'] }) {
  const { client } = useWebSession();
  const [draft, setDraft] = useState(initial);
  const [review, setReview] = useState(false);
  const [validation, setValidation] = useState('');
  const [saved, setSaved] = useState(false);
  const save = useStaffSave(async () => { const result = await client.api.request<Schema['IntakeSettings']>('/admin/service-intake-settings', { method: 'PUT', body: draft }); setDraft(result); setReview(false); setSaved(true); });
  return <section className="editor-panel"><p>החלונות המועדפים מוצגים בשעון ישראל. הדחיפות וזמן התגובה נשמרים בעת שליחת הבקשה.</p>
    {saved ? <p role="status">הגדרות קבלת השירות נשמרו.</p> : null}{validation ? <p role="alert">{validation}</p> : null}
    <form onChange={() => { setReview(false); setSaved(false); }} onSubmit={(event) => {
      event.preventDefault(); setValidation('');
      if (new Set(draft.urgencies.map((item) => item.id)).size !== draft.urgencies.length) { setValidation('לכל אפשרות דחיפות חייב להיות מזהה ייחודי.'); return; }
      const slots = [...draft.slots].sort((a, b) => a.start.localeCompare(b.start));
      if (slots.some((slot, index) => slot.end <= slot.start || index > 0 && slots[index - 1].end > slot.start)) { setValidation('זמן הסיום חייב להיות אחרי זמן ההתחלה. חלונות השעות אינם יכולים לחפוף.'); return; }
      setReview(true);
    }}><fieldset disabled={save.isPending}>
      <h2>אפשרויות דחיפות</h2>{draft.urgencies.map((urgency, index) => <fieldset className="config-row form-grid" key={index}><legend>דחיפות {index + 1}</legend>
        <FormField label={`דחיפות ${index + 1}: מזהה`} dir="ltr" value={urgency.id} pattern="[a-z][a-z0-9_-]{0,39}" required onChange={(event) => setDraft({ ...draft, urgencies: draft.urgencies.map((item, i) => i === index ? { ...item, id: event.target.value } : item) })} />
        <FormField label={`דחיפות ${index + 1}: שם בעברית`} value={urgency.name_he} maxLength={80} required dir="rtl" onChange={(event) => setDraft({ ...draft, urgencies: draft.urgencies.map((item, i) => i === index ? { ...item, name_he: event.target.value } : item) })} />
        <FormField label={`דחיפות ${index + 1}: תיאור בעברית`} value={urgency.description_he} maxLength={160} required dir="rtl" onChange={(event) => setDraft({ ...draft, urgencies: draft.urgencies.map((item, i) => i === index ? { ...item, description_he: event.target.value } : item) })} />
        <FormField label={`דחיפות ${index + 1}: תוספת באחוזים`} type="number" min={0} max={1000} step={1} required value={urgency.surcharge_percent} onChange={(event) => setDraft({ ...draft, urgencies: draft.urgencies.map((item, i) => i === index ? { ...item, surcharge_percent: Number(event.target.value) } : item) })} />
        <button type="button" disabled={draft.urgencies.length === 1} onClick={() => { setDraft({ ...draft, urgencies: draft.urgencies.filter((_, i) => i !== index) }); setReview(false); }}>הסרת דחיפות {index + 1}</button>
      </fieldset>)}
      <button type="button" disabled={draft.urgencies.length >= 12} onClick={() => { setDraft({ ...draft, urgencies: [...draft.urgencies, { id: '', name_he: '', description_he: '', surcharge_percent: 0 }] }); setReview(false); }}>הוספת דחיפות</button>
      <fieldset><legend>ימי תיאום זמינים</legend>{weekdays.map((day, index) => <label key={day}><input type="checkbox" checked={draft.weekdays.includes(index)} onChange={(event) => setDraft({ ...draft, weekdays: event.target.checked ? [...draft.weekdays, index].sort() : draft.weekdays.filter((value) => value !== index) })} /> {day}</label>)}</fieldset>
      <h2>חלונות שעות מועדפים</h2>{draft.slots.map((slot, index) => <fieldset className="config-row form-grid" key={index}><legend>חלון {index + 1}</legend>
        <FormField label={`חלון ${index + 1}: התחלה`} type="time" required value={slot.start} onChange={(event) => setDraft({ ...draft, slots: draft.slots.map((item, i) => i === index ? { ...item, start: event.target.value } : item) })} />
        <FormField label={`חלון ${index + 1}: סיום`} type="time" required value={slot.end} onChange={(event) => setDraft({ ...draft, slots: draft.slots.map((item, i) => i === index ? { ...item, end: event.target.value } : item) })} />
        <button type="button" onClick={() => { setDraft({ ...draft, slots: draft.slots.filter((_, i) => i !== index) }); setReview(false); }}>הסרת חלון {index + 1}</button>
      </fieldset>)}
      <button type="button" disabled={draft.slots.length >= 12} onClick={() => { setDraft({ ...draft, slots: [...draft.slots, { start: '', end: '' }] }); setReview(false); }}>הוספת חלון שעות</button>
      <FormField label="טווח הזמנה בימים" type="number" min={1} max={60} step={1} required value={draft.horizon_days} onChange={(event) => setDraft({ ...draft, horizon_days: Number(event.target.value) })} />
      <FormField label="זמן תגובה צפוי בשעות" type="number" min={1} max={168} step={1} required value={draft.response_hours} onChange={(event) => setDraft({ ...draft, response_hours: Number(event.target.value) })} />
      <button type="submit">סקירת הגדרות קבלת שירות</button>
    </fieldset></form>
    {review ? <ConfirmAction label="שמירת הגדרות קבלת שירות" recordLabel={`הגדרות קבלת שירות, גרסה ${draft.version}`} description={`החלת ${draft.urgencies.length} אפשרויות דחיפות, ${draft.weekdays.map((day) => weekdays[day]).join(', ') || 'ללא ימי תיאום'}, ${draft.slots.length} חלונות שעות, טווח הזמנה של ${draft.horizon_days} ימים וזמן תגובה של ${draft.response_hours} שעות על בקשות עתידיות. התמחור והדחיפות בבקשות קיימות אינם משתנים.`} onConfirm={async () => { await save.mutateAsync(); }} /> : null}
  </section>;
}
