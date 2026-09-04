import type { PillTone } from '../../components/Pill';
import type { Order, OrderHistoryEntry, OrderStatus } from './api';

export type OrderFilter = 'all' | 'active' | 'done';

type StatusMeta = {
  bucket: Exclude<OrderFilter, 'all'>;
  label: string;
  tone: PillTone;
};

const STATUS_META: Record<OrderStatus, StatusMeta> = {
  cancelled: { bucket: 'done', label: 'בוטלה', tone: 'neutral' },
  delivered: { bucket: 'done', label: 'נמסר', tone: 'success' },
  paid: { bucket: 'active', label: 'שולם', tone: 'success' },
  payment_expired: { bucket: 'done', label: 'פג תוקף התשלום', tone: 'neutral' },
  pending_payment: { bucket: 'active', label: 'ממתין לתשלום', tone: 'accent' },
  processing: { bucket: 'active', label: 'בהכנה', tone: 'accent' },
  refunded: { bucket: 'done', label: 'הוחזר תשלום', tone: 'neutral' },
  shipped: { bucket: 'active', label: 'נשלח', tone: 'accent' },
};

const TERMINAL_EXPLANATIONS: Partial<Record<OrderStatus, string>> = {
  cancelled: 'ההזמנה בוטלה.',
  payment_expired: 'חלון התשלום הסתיים והפריטים שוחררו.',
  refunded: 'התשלום הוחזר במלואו.',
};

export function orderStatusLabel(status: OrderStatus): string {
  return STATUS_META[status].label;
}

export function orderStatusTone(status: OrderStatus): PillTone {
  return STATUS_META[status].tone;
}

export function orderStatusExplanation(status: OrderStatus): string | null {
  return TERMINAL_EXPLANATIONS[status] ?? null;
}

export const ORDER_FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'active', label: 'פעילות' },
  { key: 'done', label: 'הסתיימו' },
] as const satisfies readonly { key: OrderFilter; label: string }[];

export function filterOrders(orders: readonly Order[], filter: OrderFilter): Order[] {
  if (filter === 'all') {
    return [...orders];
  }
  return orders.filter((order) => STATUS_META[order.state].bucket === filter);
}

export function ordersEmptyMessage(filter: OrderFilter): string {
  if (filter === 'active') {
    return 'אין הזמנות פעילות';
  }
  if (filter === 'done') {
    return 'אין הזמנות שהסתיימו';
  }
  return 'עדיין אין הזמנות';
}

// Fulfillment milestones shown as a progress bar. "הוזמן" means the order is
// confirmed (payment received); an unpaid order has not progressed.
export const FULFILLMENT_STEPS = ['הוזמן', 'בהכנה', 'נשלח', 'נמסר'] as const;

const PROGRESS_BY_STATUS: Partial<Record<OrderStatus, number>> = {
  delivered: 4,
  paid: 1,
  pending_payment: 0,
  processing: 2,
  shipped: 3,
};

export function fulfillmentProgress(status: OrderStatus): number | null {
  return PROGRESS_BY_STATUS[status] ?? null;
}

export type TimelineEntry = {
  key: string;
  label: string;
  state: OrderStatus;
  timestamp: string | null;
};

type OrderedEntry = { entry: OrderHistoryEntry; index: number };

function compareEntries(a: OrderedEntry, b: OrderedEntry): number {
  const left = a.entry.created_at;
  const right = b.entry.created_at;
  if (left && right && left !== right) {
    return left < right ? -1 : 1;
  }
  if (left && !right) {
    return 1;
  }
  if (!left && right) {
    return -1;
  }
  return a.index - b.index;
}

export function buildTimeline(history: readonly OrderHistoryEntry[]): TimelineEntry[] {
  return history
    .map((entry, index) => ({ entry, index }))
    .sort(compareEntries)
    .map(({ entry, index }) => ({
      key: `${entry.to_state}-${entry.created_at ?? `i${index}`}`,
      label: orderStatusLabel(entry.to_state),
      state: entry.to_state,
      timestamp: entry.created_at,
    }));
}

export function safeTrackingUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  const trimmed = url.trim();
  return /^https:\/\/[^\s/?#]+(?:[/?#]\S*)?$/i.test(trimmed) ? trimmed : null;
}

export function formatOrderTimestamp(iso: string | null | undefined): string {
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
