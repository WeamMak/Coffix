import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { commercePage, order, problem } from './commerceSupport';

it('shows paid queues and only server-authorized order actions', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/orders', (url) => Response.json(url.pathname.endsWith('/order-1') ? order : [order]));
  await user.click(await screen.findByRole('link', { name: order.order_number }));
  expect(await screen.findByRole('button', { name: 'העברה להכנה' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'ביטול הזמנה' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'סימון כנמסרה' })).not.toBeInTheDocument();
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('state=paid'))).toBe(true);
});
it('requires the order number and reason, confirms full amount, and retains pending refund outcome', async () => {
  const user = userEvent.setup();
  let refunded = false;
  const refund = { id: 'refund-1', amount_agorot: 11900, state: 'pending', reason: 'Returned unopened' };
  const fetcher = commercePage('/orders/order-1', (_, init) => {
    if (init?.method === 'POST') { refunded = true; return Response.json({ refund_id: refund.id, ...refund }); }
    return Response.json(refunded ? { ...order, refund, allowed_actions: ['process'] } : order);
  });
  await screen.findByRole('heading', { name: order.order_number });
  await user.click(screen.getByRole('button', { name: 'סקירת החזר מלא' }));
  expect(screen.getByLabelText('סיבה')).toBeInvalid();
  await user.type(screen.getByLabelText('סיבה'), 'Returned unopened');
  await user.type(screen.getByLabelText('מספר הזמנה לאישור'), 'CFX-WRONG');
  await user.click(screen.getByRole('button', { name: 'סקירת החזר מלא' }));
  expect(screen.getByLabelText('מספר הזמנה לאישור')).toBeInvalid();
  await user.clear(screen.getByLabelText('מספר הזמנה לאישור')); await user.type(screen.getByLabelText('מספר הזמנה לאישור'), order.order_number);
  await user.click(screen.getByRole('button', { name: 'סקירת החזר מלא' }));
  await user.click(screen.getByRole('button', { name: 'החזר הזמנה' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('119.00');
  expect(screen.getByRole('dialog')).toHaveTextContent(order.order_number);
  await user.click(screen.getByRole('button', { name: 'אישור: החזר הזמנה' }));
  expect(await screen.findByText(/ההחזר בטיפול/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'החזר הזמנה' })).not.toBeInTheDocument();
  expect(fetcher.mock.calls.find(([url]) => String(url).endsWith('/refund'))?.[1]?.headers).toHaveProperty('Idempotency-Key');
});
it('keeps an invalid transition visible without inventing a new state', async () => {
  const user = userEvent.setup();
  commercePage('/orders/order-1', (_, init) => init?.method === 'POST' ? problem('INVALID_ORDER_TRANSITION', 'Order transition is not allowed') : Response.json(order));
  await user.click(await screen.findByRole('button', { name: 'העברה להכנה' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('לא ניתן לבצע את הפעולה במצב ההזמנה הנוכחי');
  expect(screen.getByText('שולמה', { selector: '.status-badge' })).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: 'רענון ההזמנה' })).toBeEnabled());
});

it('validates HTTP tracking and submits the shipment command', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/orders/order-1', () => Response.json({ ...order, state: 'processing', allowed_actions: ['ship'] }));
  await user.type(await screen.findByLabelText('חברת משלוח'), 'Israel Post');
  await user.type(screen.getByLabelText('מספר מעקב'), 'TRACK-26');
  await user.type(screen.getByLabelText('קישור מעקב'), 'javascript:alert(1)');
  await user.click(screen.getByRole('button', { name: 'שמירת המשלוח וסימון כנשלחה' }));
  expect(screen.getByLabelText('קישור מעקב')).toBeInvalid();
  await user.clear(screen.getByLabelText('קישור מעקב')); await user.type(screen.getByLabelText('קישור מעקב'), 'https://example.com/TRACK-26');
  await user.click(screen.getByRole('button', { name: 'שמירת המשלוח וסימון כנשלחה' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/ship') && init?.body === JSON.stringify({ carrier: 'Israel Post', tracking_number: 'TRACK-26', tracking_url: 'https://example.com/TRACK-26' }))).toBe(true));
});
it.each(['failed', 'confirmed'])('shows the persisted %s refund outcome without offering another refund', async (state) => {
  commercePage('/orders/order-1', () => Response.json({ ...order, refund: { id: 'refund-1', state, reason: 'Returned', amount_agorot: 11900 }, allowed_actions: ['process'] }));
  expect(await screen.findByText(state === 'failed' ? /ההחזר נכשל/ : /ההחזר המלא אושר/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'סקירת החזר מלא' })).not.toBeInTheDocument();
});
it('reuses the same refund key and body after a lost response', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/orders/order-1', (url) => { if (url.pathname.endsWith('/refund')) throw new TypeError('offline'); return Response.json(order); });
  await user.type(await screen.findByLabelText('סיבה'), 'Duplicate purchase');
  await user.type(screen.getByLabelText('מספר הזמנה לאישור'), order.order_number);
  await user.click(screen.getByRole('button', { name: 'סקירת החזר מלא' }));
  await user.click(screen.getByRole('button', { name: 'החזר הזמנה' }));
  await user.click(screen.getByRole('button', { name: 'אישור: החזר הזמנה' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('לא ניתן להתחבר');
  await user.click(screen.getByRole('button', { name: 'אישור: החזר הזמנה' }));
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/refund'))).toHaveLength(2));
  const calls = fetcher.mock.calls.filter(([url]) => String(url).endsWith('/refund'));
  expect(calls[0][1]?.body).toEqual(calls[1][1]?.body);
  expect(calls[0][1]?.headers).toEqual(calls[1][1]?.headers);
});
