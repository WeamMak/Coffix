import type { ServiceRequest } from './api';

export type ProgressStep = {
  key: string;
  label: string;
  phase: 'done' | 'current' | 'future' | 'rejected';
  timestamp: string | null;
  detail?: string;
  staffName?: string;
};
const position: Record<ServiceRequest['state'], number> = {
  awaiting_intake_review: 0, awaiting_diagnostic_payment: 2, awaiting_admin_review: 3,
  scheduled: 3, received: 4, diagnosing: 4, awaiting_additional_decision: 4,
  awaiting_additional_payment: 4, repair_in_progress: 4, ready_for_return: 5,
  completed: 6, cancelled: 0,
};

export function serviceProgressSteps(request: ServiceRequest): ProgressStep[] {
  const history = [...request.history].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const event = (state: ServiceRequest['state']) => history.find(item => item.to_state === state);
  const cancellation = [...history].reverse().find(item => item.to_state === 'cancelled');
  const cancelled = request.state === 'cancelled';
  const rejected = cancelled && cancellation?.source === 'customer' && ['awaiting_diagnostic_payment', 'awaiting_additional_decision', 'awaiting_additional_payment'].includes(cancellation.from_state ?? '');
  const current = position[cancelled ? cancellation?.from_state ?? 'awaiting_intake_review' : request.state];
  const timestamps = [
    event('awaiting_intake_review')?.created_at ?? request.created_at,
    event('awaiting_diagnostic_payment')?.created_at ?? null,
    rejected ? cancellation!.created_at : event('awaiting_admin_review')?.created_at ?? event('awaiting_diagnostic_payment')?.created_at ?? null,
    event('received')?.created_at ?? request.confirmed_appointment_start ?? null,
    event('ready_for_return')?.created_at ?? event('diagnosing')?.created_at ?? event('repair_in_progress')?.created_at ?? null,
    event('completed')?.created_at ?? event('ready_for_return')?.created_at ?? null,
  ];
  const handledBy = (...states: ServiceRequest['state'][]) => [...history].reverse().find(item => states.includes(item.to_state) && item.staff_name)?.staff_name;
  const assigned = request.assigned_technician?.display_name;
  const reviewer = handledBy('awaiting_diagnostic_payment') ?? request.reviewed_by?.display_name;
  const staffNames = [
    undefined,
    reviewer,
    handledBy('awaiting_additional_decision') ?? reviewer,
    handledBy('received') ?? assigned,
    handledBy('diagnosing', 'repair_in_progress', 'ready_for_return') ?? assigned,
    handledBy('completed', 'ready_for_return') ?? assigned,
  ];
  const labels = ['בקשה נשלחה', 'אגרת אבחון נקבעה', 'ממתין לתשלום', request.location_mode === 'pickup' ? 'איסוף' : 'הבאה לחנות', 'אבחון ותיקון', 'החזרה'];
  return labels.map((label, index) => ({
    key: String(index), label,
    phase: rejected && index === 2 ? 'rejected' : index < current ? 'done' : index === current && !cancelled ? 'current' : 'future',
    timestamp: timestamps[index] ?? null,
    staffName: index > 0 ? staffNames[index] || 'טרם שויך טכנאי' : undefined,
    detail: rejected && index === 2 ? 'נדחה' : cancelled && index === current && !rejected ? 'השירות בוטל' : undefined,
  }));
}
