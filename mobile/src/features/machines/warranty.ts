import type { PillTone } from '../../components/Pill';
import type { Machine } from './api';

// Warranty eligibility and duration are entirely server-decided and snapshotted
// on the machine (`warranty_start_date` / `warranty_end_date` / `warranty_months`).
// The helpers below only format those already-decided values for display and
// compare the snapshot to "now" to label it active/expired — they never decide
// whether a machine qualifies for warranty or for how long.
export type WarrantyState = 'active' | 'expired' | 'none';

export function warrantyState(machine: Machine, now: Date = new Date()): WarrantyState {
  if (!machine.warranty_end_date) {
    return 'none';
  }
  return now.getTime() <= new Date(machine.warranty_end_date).getTime() ? 'active' : 'expired';
}

// `warranty_end_date` is a Pydantic `date` (YYYY-MM-DD); render it as DD/MM/YYYY.
export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return year && month && day ? `${day}/${month}/${year}` : isoDate;
}

export function warrantyLabel(machine: Machine, now: Date = new Date()): string {
  const state = warrantyState(machine, now);
  if (state === 'none') {
    return 'אין אחריות Coffix';
  }
  const endDate = formatIsoDate(machine.warranty_end_date!);
  return state === 'active' ? `אחריות פעילה עד ${endDate}` : `אחריות פגה ב־${endDate}`;
}

export function warrantyTone(machine: Machine, now: Date = new Date()): PillTone {
  return warrantyState(machine, now) === 'active' ? 'success' : 'neutral';
}

export function sourceLabel(machine: Machine): string {
  return machine.source === 'order' ? 'נרכש באפליקציה' : 'נרשם ידנית';
}

export function needsSerialCompletion(machine: Machine): boolean {
  return machine.serial_pending;
}

export function serialDisplay(machine: Machine): string {
  return machine.serial_pending ? 'יש להשלים מספר סידורי' : machine.serial_number ?? '—';
}

// Service-request state labels for the machine detail's service-history list
// (docs/spec.md §8.2). The full state machine and its UI belong to the
// service-request screens (mobile/src/features/service/status.ts); this is
// only enough to label a machine's past requests, and falls back to the raw
// state for any value it doesn't recognize rather than hiding it.
const SERVICE_STATE_LABELS: Record<string, string> = {
  awaiting_additional_decision: 'ממתין להחלטתכם',
  awaiting_additional_payment: 'ממתין לתשלום נוסף',
  awaiting_admin_review: 'בבדיקת הצוות',
  awaiting_diagnostic_payment: 'ממתין לתשלום אבחון',
  cancelled: 'בוטל',
  completed: 'הושלם',
  diagnosing: 'באבחון',
  ready_for_return: 'מוכן להחזרה',
  received: 'התקבל',
  repair_in_progress: 'בתיקון',
  scheduled: 'מתוזמן',
};

const SERVICE_STATE_TONES: Record<string, PillTone> = {
  awaiting_additional_decision: 'warn',
  awaiting_additional_payment: 'warn',
  awaiting_admin_review: 'accent',
  awaiting_diagnostic_payment: 'warn',
  cancelled: 'neutral',
  completed: 'success',
  diagnosing: 'accent',
  ready_for_return: 'accent',
  received: 'accent',
  repair_in_progress: 'accent',
  scheduled: 'accent',
};

export function serviceHistoryStatusLabel(state: string): string {
  return SERVICE_STATE_LABELS[state] ?? state;
}

export function serviceHistoryStatusTone(state: string): PillTone {
  return SERVICE_STATE_TONES[state] ?? 'neutral';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Jerusalem',
    })
      .format(date)
      .replace(', ', ' · ');
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
