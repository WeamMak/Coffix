import type { PillTone } from '../../components/Pill';
import type { Machine } from './api';

// Eligibility and active/expired status come from the server's clock and snapshots.
export type WarrantyState = Machine['warranty_status'];

export function warrantyState(machine: Machine): WarrantyState {
  return machine.warranty_status;
}

// `warranty_end_date` is a Pydantic `date` (YYYY-MM-DD); render it as DD/MM/YYYY.
export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return year && month && day ? `${day}/${month}/${year}` : isoDate;
}

// Compact form for list rows and badges — no date.
export function warrantyLabelShort(machine: Machine): string {
  const state = warrantyState(machine);
  if (state === 'none') {
    return 'אין אחריות';
  }
  return state === 'active' ? 'אחריות פעילה' : 'אחריות פגה';
}

// Full form for the machine detail's "סטטוס" details row, which has no
// separate "אחריות" label of its own so the value needs to stand alone.
export function warrantyLabel(machine: Machine): string {
  const state = warrantyState(machine);
  if (state === 'none') {
    return 'אין אחריות';
  }
  const endDate = formatIsoDate(machine.warranty_end_date!);
  return state === 'active' ? `אחריות פעילה עד ${endDate}` : `אחריות פגה ב־${endDate}`;
}

// Compact form for the warranty card, which already labels itself "אחריות" —
// repeating the word in the value would be redundant.
export function warrantyCardValue(machine: Machine): string {
  const state = warrantyState(machine);
  if (state === 'none') {
    return 'אין אחריות';
  }
  const endDate = formatIsoDate(machine.warranty_end_date!);
  return state === 'active' ? `פעיל · עד ${endDate}` : `פג תוקף · ${endDate}`;
}

// Tones deliberately avoid a true red: the app's warm palette has none, and
// every other "needs attention" state elsewhere already uses warn (orange)
// rather than a dedicated danger color, so expired stays visually consistent
// with that vocabulary while still reading as distinct from active/none.
export function warrantyTone(machine: Machine): PillTone {
  const state = warrantyState(machine);
  if (state === 'active') {
    return 'success';
  }
  return state === 'expired' ? 'warn' : 'neutral';
}

export function sourceLabel(machine: Machine): string {
  return machine.source === 'order' ? 'נרכש באפליקציה' : 'נרשם ידנית';
}

// Service requests still open (not completed or cancelled) for this machine.
export function activeServiceCount(machine: Machine): number {
  return machine.service_history.filter(
    (entry) => entry.state !== 'completed' && entry.state !== 'cancelled',
  ).length;
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
