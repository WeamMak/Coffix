import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { commercePage, order, problem } from './commerceSupport';

it('shows paid queues and only server-authorized order actions', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/orders', (url) => Response.json(url.pathname.endsWith('/order-1') ? order : [order]));
  await user.click(await screen.findByRole('link', { name: order.order_number }));
  expect(await screen.findByRole('button', { name: 'Start processing' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Mark delivered' })).not.toBeInTheDocument();
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
  await user.click(screen.getByRole('button', { name: 'Review full refund' }));
  expect(screen.getByLabelText('Reason')).toBeInvalid();
  await user.type(screen.getByLabelText('Reason'), 'Returned unopened');
  await user.type(screen.getByLabelText('Confirm order number'), 'CFX-WRONG');
  await user.click(screen.getByRole('button', { name: 'Review full refund' }));
  expect(screen.getByLabelText('Confirm order number')).toBeInvalid();
  await user.clear(screen.getByLabelText('Confirm order number')); await user.type(screen.getByLabelText('Confirm order number'), order.order_number);
  await user.click(screen.getByRole('button', { name: 'Review full refund' }));
  await user.click(screen.getByRole('button', { name: 'Refund order' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('119.00');
  expect(screen.getByRole('dialog')).toHaveTextContent(order.order_number);
  await user.click(screen.getByRole('button', { name: 'Confirm refund order' }));
  expect(await screen.findByText(/Refund pending/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Refund order' })).not.toBeInTheDocument();
  expect(fetcher.mock.calls.find(([url]) => String(url).endsWith('/refund'))?.[1]?.headers).toHaveProperty('Idempotency-Key');
});
it('keeps an invalid transition visible without inventing a new state', async () => {
  const user = userEvent.setup();
  commercePage('/orders/order-1', (_, init) => init?.method === 'POST' ? problem('INVALID_ORDER_TRANSITION', 'Order transition is not allowed') : Response.json(order));
  await user.click(await screen.findByRole('button', { name: 'Start processing' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Order transition is not allowed');
  expect(screen.getByText('paid', { selector: '.status-badge' })).toBeVisible();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh order' })).toBeEnabled());
});

it('validates HTTP tracking and submits the shipment command', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/orders/order-1', () => Response.json({ ...order, state: 'processing', allowed_actions: ['ship'] }));
  await user.type(await screen.findByLabelText('Carrier'), 'Israel Post');
  await user.type(screen.getByLabelText('Tracking number'), 'TRACK-26');
  await user.type(screen.getByLabelText('Tracking URL'), 'javascript:alert(1)');
  await user.click(screen.getByRole('button', { name: 'Save shipment and mark shipped' }));
  expect(screen.getByLabelText('Tracking URL')).toBeInvalid();
  await user.clear(screen.getByLabelText('Tracking URL')); await user.type(screen.getByLabelText('Tracking URL'), 'https://example.com/TRACK-26');
  await user.click(screen.getByRole('button', { name: 'Save shipment and mark shipped' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/ship') && init?.body === JSON.stringify({ carrier: 'Israel Post', tracking_number: 'TRACK-26', tracking_url: 'https://example.com/TRACK-26' }))).toBe(true));
});
it.each(['failed', 'confirmed'])('shows the persisted %s refund outcome without offering another refund', async (state) => {
  commercePage('/orders/order-1', () => Response.json({ ...order, refund: { id: 'refund-1', state, reason: 'Returned', amount_agorot: 11900 }, allowed_actions: ['process'] }));
  expect(await screen.findByText(state === 'failed' ? /Refund failed/ : /Full refund confirmed/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Review full refund' })).not.toBeInTheDocument();
});
it('reuses the same refund key and body after a lost response', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/orders/order-1', (url) => { if (url.pathname.endsWith('/refund')) throw new TypeError('offline'); return Response.json(order); });
  await user.type(await screen.findByLabelText('Reason'), 'Duplicate purchase');
  await user.type(screen.getByLabelText('Confirm order number'), order.order_number);
  await user.click(screen.getByRole('button', { name: 'Review full refund' }));
  await user.click(screen.getByRole('button', { name: 'Refund order' }));
  await user.click(screen.getByRole('button', { name: 'Confirm refund order' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect');
  await user.click(screen.getByRole('button', { name: 'Confirm refund order' }));
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/refund'))).toHaveLength(2));
  const calls = fetcher.mock.calls.filter(([url]) => String(url).endsWith('/refund'));
  expect(calls[0][1]?.body).toEqual(calls[1][1]?.body);
  expect(calls[0][1]?.headers).toEqual(calls[1][1]?.headers);
});
