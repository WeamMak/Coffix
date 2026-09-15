import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { commercePage, problem } from './commerceSupport';
import { staffUser } from './serviceSupport';
import type { Schema } from '../src/features/service/api';

const delivery = {
  id: 'delivery-1', notification_id: 'message-1', recipient_name: 'נועה כהן', recipient_phone: '+972501000002',
  notification_title: 'ההזמנה מוכנה', notification_body: 'אפשר לעקוב באפליקציה CFX', related_entity_type: 'order', related_entity_id: 'order-1', related_entity_reference: 'CFX-10001',
  device_platform: 'android', state: 'retry', attempt_count: 2, last_error_code: 'PUSH_RETRYABLE_FAILURE', next_attempt_at: '2026-09-15T12:00:00Z', updated_at: '2026-09-15T11:00:00Z', claimed_at: null, dead_lettered_at: null, can_retry: true, retry_unavailable_reason: null,
} satisfies Schema['DeliveryFailureRead'];
const audit = {
  id: 'audit-1', actor_id: 'admin-1', actor_name: 'מנהלת החנות', actor_phone: '+972501000001', target_type: 'shop_settings', target_id: null, target_label: 'הגדרות החנות', target_reference: null,
  action: 'shop.settings_updated', before: { shipping_fee_agorot: 3000 }, after: { shipping_fee_agorot: 4000 }, created_at: '2026-09-15T11:00:00Z', correlation_id: 'support-31', ip_address: null, request_metadata: {},
} satisfies Schema['AuditLogRead'];

it('identifies a delivery recipient and message and confirms a queued retry without claiming it was sent', async () => {
  const user = userEvent.setup(); let queued = false;
  const fetcher = commercePage('/operations', (url) => {
    if (url.pathname.endsWith('/retry')) { queued = true; return Response.json({ ...delivery, state: 'pending', can_retry: false }); }
    return Response.json(queued ? [] : [delivery]);
  });
  expect(await screen.findByText('נועה כהן')).toBeVisible();
  expect(screen.getByText(delivery.notification_body)).toHaveAttribute('dir', 'auto');
  expect(screen.getByRole('link', { name: 'CFX-10001' })).toHaveAttribute('href', '/orders/order-1');
  expect(screen.getByText('מתוכננת שליחה חוזרת')).toBeVisible();
  expect(screen.getByText(/תקלה זמנית אצל ספק/)).toBeVisible();
  expect(screen.getByText(/ההודעה עשויה להיות זמינה באפליקציה/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'ניסיון שליחה חוזר' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('נועה כהן');
  expect(screen.getByRole('dialog')).toHaveTextContent('ההזמנה מוכנה');
  expect(screen.getByRole('dialog')).toHaveTextContent('אבדה');
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/retry'))).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'אישור: ניסיון שליחה חוזר' }));
  expect(await screen.findByRole('status')).toHaveTextContent('השליחה החוזרת הועברה לתור');
  expect(screen.getByText(/אישור הספק אינו אישור/)).toBeVisible();
  expect(await screen.findByText('אין כרגע בעיות בשליחת התראות.')).toBeVisible();
});

it('explains inactive, transferred and claimed devices without suggesting unavailable retries', async () => {
  commercePage('/operations', () => Response.json([
    { ...delivery, id: 'inactive', can_retry: false, retry_unavailable_reason: 'device_inactive', last_error_code: 'INVALID_TOKEN', state: 'dead_letter', dead_lettered_at: delivery.updated_at },
    { ...delivery, id: 'moved', can_retry: false, retry_unavailable_reason: 'device_owner_changed', last_error_code: 'DEVICE_SESSION_ENDED' },
    { ...delivery, id: 'claimed', can_retry: false, retry_unavailable_reason: 'delivery_in_progress', claimed_at: delivery.updated_at, last_error_code: 'FUTURE_ERROR' },
  ]));
  expect(await screen.findByText(/המכשיר אינו פעיל/)).toBeVisible();
  expect(screen.getByText(/המכשיר משויך כעת לחשבון אחר/)).toBeVisible();
  expect(screen.getByText('בשליחה')).toBeVisible();
  expect(screen.getByText('השליחה הופסקה')).toBeVisible();
  expect(screen.getByText(/סיבת התקלה אינה זמינה/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'ניסיון שליחה חוזר' })).not.toBeInTheDocument();
});

it('formats recorded audit changes and leaves missing, unchanged and unknown values honest', async () => {
  commercePage('/operations/audit', () => Response.json([
    audit,
    { ...audit, id: 'roles', action: 'user.access_changed', target_type: 'user', target_label: 'נועה כהן', target_reference: '+972501000002', target_id: 'person-1', before: { role: 'customer', is_active: true, state: 'paid', unchanged: 'same', nullable: null }, after: { role: 'technician', is_active: false, state: 'processing', unchanged: 'same', future_field: 'future' } },
    { ...audit, id: 'unknown', actor_id: null, actor_name: null, actor_phone: null, target_label: null, target_type: 'future_record', target_id: 'gone', action: 'future.action', before: null, after: { future_field: 'recorded-only' } },
  ]));
  const table = await screen.findByRole('table');
  expect(within(table).getAllByText('מנהלת החנות')[0]).toBeVisible();
  expect(within(table).getByText('שינוי דמי משלוח')).toBeVisible();
  const shipping = within(table).getByText('דמי משלוח').closest('li')!;
  expect(shipping).toHaveTextContent('30.00'); expect(shipping).toHaveTextContent('40.00');
  expect(shipping).toHaveTextContent('→');
  expect(within(table).getByText((_, node) => node?.className === 'change-values' && node.textContent === 'לקוח → טכנאי')).toBeVisible();
  expect(within(table).getByText((_, node) => node?.className === 'change-values' && node.textContent === 'כן → לא')).toBeVisible();
  expect(within(table).getByText((_, node) => node?.className === 'change-values' && node.textContent === 'שולמה → בהכנה')).toBeVisible();
  expect(within(table).getAllByText(/ללא שינוי/).length).toBeGreaterThan(0);
  expect(within(table).getByText((_, node) => node?.className === 'change-values' && node.textContent === 'ללא ערך → לא תועד')).toBeVisible();
  expect(within(table).getByText('מערכת')).toBeVisible();
  expect(within(table).getByText('פעולה נוספת')).toBeVisible();
  expect(within(table).getByText('הרשומה אינה זמינה או שסוגה אינו נתמך')).toBeVisible();
  expect(within(table).getByText((_, node) => node?.className === 'change-values' && node.textContent === 'לא תועד → recorded-only')).toBeVisible();
  expect(within(table).queryByRole('link', { name: 'gone' })).not.toBeInTheDocument();
});

it('searches people and references and converts Israel-local audit boundaries to UTC', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/operations/audit', (url) => Response.json(url.pathname.endsWith('/users') ? [staffUser] : []));
  await user.type(await screen.findByLabelText('אסמכתה או שם רשומה'), 'CFX-10001');
  await user.selectOptions(screen.getByLabelText('פעולה'), 'shop.settings_updated');
  await user.selectOptions(screen.getByLabelText('סוג רשומה'), 'shop_settings');
  await user.type(screen.getByLabelText('חיפוש מבצע לפי שם או טלפון'), 'Dana');
  await user.click(screen.getByRole('button', { name: 'חיפוש מבצע' }));
  await user.selectOptions(await screen.findByLabelText('מבצע הפעולה'), staffUser.id);
  fireEvent.change(screen.getByLabelText('מתאריך (שעון ישראל)'), { target: { value: '2026-09-15T09:00' } });
  fireEvent.change(screen.getByLabelText('עד לתאריך, לא כולל (שעון ישראל)'), { target: { value: '2026-09-16T09:00' } });
  await user.click(screen.getByRole('button', { name: 'סינון יומן הפעילות' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => {
    const q = new URL(String(url), 'http://localhost').searchParams;
    return q.get('q') === 'CFX-10001' && q.get('actor_id') === staffUser.id && q.get('from_time') === '2026-09-15T06:00:00.000Z' && q.get('to_time') === '2026-09-16T06:00:00.000Z';
  })).toBe(true));
  expect(screen.getByLabelText('מתאריך (שעון ישראל)')).toHaveValue('2026-09-15T09:00');
  await user.click(screen.getByRole('button', { name: 'ניקוי מסננים' }));
  expect(screen.getByLabelText('אסמכתה או שם רשומה')).toHaveValue('');
});

it('rejects ambiguous Israel clock changes before querying history', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/operations/audit', () => Response.json([]));
  fireEvent.change(await screen.findByLabelText('מתאריך (שעון ישראל)'), { target: { value: '2026-10-25T01:30' } });
  await user.click(screen.getByRole('button', { name: 'סינון יומן הפעילות' }));
  expect(screen.getByRole('alert')).toHaveTextContent('מופיעה פעמיים');
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('from_time='))).toBe(false);
});

it.each(['/operations', '/operations/audit'])('recovers a failed load and offers a useful empty state on %s', async (path) => {
  const user = userEvent.setup(); let failed = true;
  commercePage(path, () => failed ? problem('unexpected_error', 'private provider payload') : Response.json([]));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByText('private provider payload')).not.toBeInTheDocument();
  failed = false;
  await user.click(screen.getByRole('button', { name: 'טעינה מחדש' }));
  expect(await screen.findByText(path === '/operations' ? 'אין כרגע בעיות בשליחת התראות.' : 'לא נמצאו אירועים למסננים שנבחרו. אפשר לנקות את המסננים ולהרחיב את החיפוש.')).toBeVisible();
});

it.each(['/operations', '/operations/audit'])('shows loading while the authoritative read is pending on %s', async (path) => {
  let finish!: (response: Response) => void;
  commercePage(path, () => new Promise<Response>((resolve) => { finish = resolve; }));
  expect(await screen.findByText(path === '/operations' ? 'טוענים בעיות בשליחת התראות…' : 'טוענים אירועי פעילות…')).toBeVisible();
  finish(Response.json([]));
  expect(await screen.findByText(path === '/operations' ? 'אין כרגע בעיות בשליחת התראות.' : 'לא נמצאו אירועים למסננים שנבחרו. אפשר לנקות את המסננים ולהרחיב את החיפוש.')).toBeVisible();
});

it('preserves a failed retry confirmation and does not claim it was queued', async () => {
  const user = userEvent.setup();
  commercePage('/operations', (url) => url.pathname.endsWith('/retry') ? problem('DELIVERY_NOT_RETRYABLE', 'raw provider error') : Response.json([delivery]));
  await user.click(await screen.findByRole('button', { name: 'ניסיון שליחה חוזר' }));
  await user.click(screen.getByRole('button', { name: 'אישור: ניסיון שליחה חוזר' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('לא ניתן לבצע ניסיון שליחה נוסף כעת');
  expect(screen.getByRole('dialog')).toHaveTextContent('נועה כהן');
  expect(screen.queryByText(/השליחה החוזרת הועברה לתור/)).not.toBeInTheDocument();
});
