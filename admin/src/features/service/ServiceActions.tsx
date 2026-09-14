import { useState } from 'react';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { useWebSession } from '../auth/useWebSession';
import { useStaffSave, type Schema } from './api';

const transitions = {
  receive: ['סימון המכונה כהתקבלה', 'תיעוד קבלת המכונה בחנות או איסופה מהלקוח.'],
  start_diagnosis: ['התחלת אבחון', 'תיעוד תחילת אבחון המכונה.'],
  ready_for_return: ['סימון כמוכנה להחזרה', 'העבודה הסתיימה והמכונה מוכנה להחזרה ללקוח.'],
  complete: ['סיום השירות', 'המכונה הוחזרה ללקוח. סגירת בקשת השירות.'],
} as const;
export function ServiceActions({ service, technician }: { service: Schema['StaffServiceRequestRead']; technician: boolean }) {
  const { client } = useWebSession();
  const [reason, setReason] = useState('');
  const prefix = technician ? `/technician/jobs/${service.id}` : `/admin/service-requests/${service.id}`;
  const command = useStaffSave((input: { endpoint: string; body?: unknown }) => client.api.request(`${prefix}/${input.endpoint}`, { method: 'POST', body: input.body }));
  return <fieldset disabled={command.isPending} className="page-actions">
    {Object.entries(transitions).filter(([action]) => service.allowed_actions.includes(action)).map(([action, [label, description]]) => <ConfirmAction key={action} label={label} recordLabel={service.reference} description={description} onConfirm={async () => { await command.mutateAsync({ endpoint: 'status', body: { action } }); }} />)}
    {!technician && service.allowed_actions.includes('start_repair') ? <ConfirmAction label="התחלת תיקון ללא עלות נוספת" recordLabel={service.reference} amountAgorot={0} description="תחילת תיקון במסגרת דמי האבחון ששולמו. לא יתבקש חיוב נוסף." onConfirm={async () => { await command.mutateAsync({ endpoint: 'no-cost-repair' }); }} /> : null}
    {!technician && service.allowed_actions.includes('cancel') ? <div className="editor-panel"><h2>ביטול בקשה</h2><FormField label="סיבת הביטול" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} />
      {reason.trim().length >= 3 ? <ConfirmAction tone="danger" label="ביטול השירות" recordLabel={service.reference} description={`${reason.trim()}. ביטול בקשת השירות שטרם שולמה.`} onConfirm={async () => { await command.mutateAsync({ endpoint: 'cancel', body: { reason: reason.trim() } }); }} /> : null}</div> : null}
  </fieldset>;
}
