import { useState } from 'react';
import { ConfirmAction } from '../../components/ConfirmAction';
import { FormField } from '../../components/FormField';
import { useWebSession } from '../auth/useWebSession';
import { useStaffSave, type Schema } from './api';

const transitions = {
  receive: ['Mark received', 'Record that the machine was brought in or collected.'],
  start_diagnosis: ['Start diagnosis', 'Record the start of diagnostic work.'],
  ready_for_return: ['Mark ready for return', 'Work is finished and the machine is ready for return.'],
  complete: ['Complete service', 'The machine has been returned. Close this service request.'],
} as const;
export function ServiceActions({ service, technician }: { service: Schema['StaffServiceRequestRead']; technician: boolean }) {
  const { client } = useWebSession();
  const [reason, setReason] = useState('');
  const prefix = technician ? `/technician/jobs/${service.id}` : `/admin/service-requests/${service.id}`;
  const command = useStaffSave((input: { endpoint: string; body?: unknown }) => client.api.request(`${prefix}/${input.endpoint}`, { method: 'POST', body: input.body }));
  return <fieldset disabled={command.isPending} className="page-actions">
    {Object.entries(transitions).filter(([action]) => service.allowed_actions.includes(action)).map(([action, [label, description]]) => <ConfirmAction key={action} label={label} recordLabel={service.reference} description={description} onConfirm={async () => { await command.mutateAsync({ endpoint: 'status', body: { action } }); }} />)}
    {!technician && service.allowed_actions.includes('start_repair') ? <ConfirmAction label="Start repair without additional cost" recordLabel={service.reference} amountAgorot={0} description="Begin repair using the paid diagnostic fee. No additional charge will be requested." onConfirm={async () => { await command.mutateAsync({ endpoint: 'no-cost-repair' }); }} /> : null}
    {!technician && service.allowed_actions.includes('cancel') ? <div className="editor-panel"><h2>Cancel request</h2><FormField label="Cancellation reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} />
      {reason.trim().length >= 3 ? <ConfirmAction label="Cancel service" recordLabel={service.reference} description={`${reason.trim()}. Cancel this unpaid service request.`} onConfirm={async () => { await command.mutateAsync({ endpoint: 'cancel', body: { reason: reason.trim() } }); }} /> : null}</div> : null}
  </fieldset>;
}
