import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { commercePage } from './commerceSupport';

it('renders authoritative totals and appointment read models without fetching orders or jobs to count them', async () => {
  const fetcher = commercePage('/overview', () => Response.json({ product_revenue_agorot: 123456, open_services: 17, awaiting_payment_orders: 3, awaiting_payment_services: 4, users_by_role: { technician: 2 }, orders_by_state: { paid: 5 }, service_requests_by_state: { diagnosing: 7 }, failed_deliveries: 2, failed_outbox_events: 6, pending_outbox_events: 9, low_stock_skus: 1, todays_appointments: [{ id: 'service-1', reference: 'SVC-TODAY', technician_name: 'Dana', start: '2026-09-08T07:00:00Z', end: '2026-09-08T08:00:00Z' }] }));
  expect(await screen.findByText('₪1,234.56')).toBeVisible();
  expect(within(screen.getByLabelText('Open services')).getByText('17')).toBeVisible();
  expect(within(screen.getByLabelText('Failed background events')).getByText('6')).toBeVisible();
  expect(screen.getByRole('link', { name: 'SVC-TODAY' })).toHaveAttribute('href', '/service/service-1');
  expect(fetcher.mock.calls.every(([url]) => String(url).endsWith('/dashboard') || String(url).endsWith('/refresh'))).toBe(true);
});

it('confirms a notification retry and shows it queued rather than delivered', async () => {
  const user = userEvent.setup();
  let failures = [{ id: 'delivery-1', notification_id: 'notice-1', state: 'dead_letter', attempt_count: 5, last_error_code: 'TEMPORARY', next_attempt_at: '2026-09-08T10:00:00Z', dead_lettered_at: '2026-09-08T10:00:00Z', can_retry: true }];
  const fetcher = commercePage('/operations', (url) => { if (url.pathname.endsWith('/retry')) { failures = []; return Response.json({ state: 'pending' }); } return Response.json(failures); });
  await user.click(await screen.findByRole('button', { name: 'Retry delivery' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('delivery-1');
  await user.click(screen.getByRole('button', { name: 'Confirm retry delivery' }));
  expect(await screen.findByText(/Retry queued/)).toBeVisible();
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/retry'))).toHaveLength(1);
});

it('sends audit filters to the server and preserves them in the URL', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/operations/audit', () => Response.json([]));
  await user.type(await screen.findByLabelText('Action contains'), 'service.assignment');
  await user.type(screen.getByLabelText('Target type'), 'service_request');
  await user.click(screen.getByRole('button', { name: 'Apply audit filters' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).includes('action=service.assignment') && String(url).includes('target_type=service_request'))).toBe(true));
});
