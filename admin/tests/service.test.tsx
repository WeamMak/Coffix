import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { commercePage } from './commerceSupport';
import { service, staffUser } from './serviceSupport';

it('reviews a diagnostic fee with snapshotted urgency and waits for payment before scheduling', async () => {
  const user = userEvent.setup();
  let current = service;
  const fetcher = commercePage('/service/service-1', (url, init) => {
    if (url.pathname.endsWith('/diagnostic-fee')) current = { ...service, state: 'awaiting_diagnostic_payment', diagnostic_base_fee_agorot: 10001, diagnostic_fee_agorot: 13001, allowed_actions: ['cancel'] };
    if (init?.method === 'POST' || url.pathname.endsWith('/service-1')) return Response.json(current);
    return Response.json([]);
  });
  expect(await screen.findByText('SERIAL-27')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Review appointment' })).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Base diagnostic fee (agorot)'), '10001');
  await user.click(screen.getByRole('button', { name: 'Review diagnostic fee' }));
  await user.click(screen.getByRole('button', { name: 'Send diagnostic offer' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('SVC-27001');
  expect(dialog).toHaveTextContent('130.01');
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/diagnostic-fee'))).toHaveLength(0);
  await user.click(within(dialog).getByRole('button', { name: 'Confirm send diagnostic offer' }));
  expect(await screen.findByText(/Awaiting diagnostic payment/)).toBeVisible();
  await waitFor(() => expect(fetcher.mock.calls.find(([url]) => String(url).endsWith('/diagnostic-fee'))?.[1]?.body).toEqual(JSON.stringify({ amount_agorot: 10001 })));
  expect(screen.queryByLabelText('Base diagnostic fee (agorot)')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review appointment' })).not.toBeInTheDocument();
});

it('filters the service queue on the server and opens a matching request', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/service', (url) => Response.json(url.pathname.endsWith('/service-1') ? service : [service]));
  await user.selectOptions(await screen.findByLabelText('Service state'), 'awaiting_intake_review');
  await user.type(screen.getByLabelText('Search'), 'SVC-27001');
  await user.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).includes('state=awaiting_intake_review') && String(url).includes('q=SVC-27001'))).toBe(true));
  await user.click(await screen.findByRole('link', { name: 'SVC-27001' }));
  expect(await screen.findByText('SERIAL-27')).toBeVisible();
});

it('starts a no-cost repair only after confirmation and exposes no repair controls while payment waits', async () => {
  const user = userEvent.setup();
  let current = { ...service, state: 'diagnosing' as const, allowed_actions: ['quote', 'start_repair'] };
  const fetcher = commercePage('/service/service-1', (url) => {
    if (url.pathname.endsWith('/no-cost-repair')) current = { ...current, allowed_actions: [] };
    return Response.json(current);
  });
  await user.click(await screen.findByRole('button', { name: 'Start repair without additional cost' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('0.00');
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/no-cost-repair'))).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Confirm start repair without additional cost' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/no-cost-repair'))).toBe(true));
});

it('previews overlaps without booking and requires explicit continuation with the chosen technician', async () => {
  const user = userEvent.setup();
  let current = { ...service, state: 'awaiting_admin_review' as const, allowed_actions: ['schedule'] };
  const fetcher = commercePage('/service/service-1', (url, init) => {
    if (url.pathname.endsWith('/technicians')) return Response.json([staffUser]);
    if (url.pathname.endsWith('/appointment-preview')) return Response.json([{ request_id: 'other', reference: 'SVC-OVERLAP', start: '2026-09-10T06:00:00Z', end: '2026-09-10T08:00:00Z' }]);
    if (url.pathname.endsWith('/appointment') && init?.method === 'POST') { current = { ...current, allowed_actions: [] }; return Response.json({ service_request: current, overlap_warnings: [] }); }
    return Response.json(current);
  });
  await screen.findByRole('option', { name: /Dana/ });
  await user.selectOptions(screen.getByLabelText('Technician'), 'tech-1');
  await user.click(screen.getByRole('button', { name: 'Review appointment' }));
  expect(await screen.findByText(/SVC-OVERLAP/)).toBeVisible();
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/appointment'))).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Confirm appointment' })).not.toBeInTheDocument();
  await user.click(screen.getByLabelText('Continue despite schedule overlaps'));
  await user.click(screen.getByRole('button', { name: 'Confirm appointment' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Dana');
  await user.click(screen.getByRole('button', { name: 'Confirm confirm appointment' }));
  await waitFor(() => expect(fetcher.mock.calls.find(([url]) => String(url).endsWith('/appointment'))?.[1]?.body).toBe(JSON.stringify({ allow_overlap: true, technician_id: 'tech-1', start: '2026-09-10T06:00:00.000Z', end: '2026-09-10T08:00:00.000Z' })));
});

it('creates an additional quote with a customer explanation and then blocks repair while payment waits', async () => {
  const user = userEvent.setup();
  let current = { ...service, state: 'diagnosing', allowed_actions: ['quote', 'start_repair'] };
  const fetcher = commercePage('/service/service-1', (url) => {
    if (url.pathname.endsWith('/quote')) current = { ...current, state: 'awaiting_additional_payment', allowed_actions: [] };
    return Response.json(current);
  });
  await user.type(await screen.findByLabelText('Base additional cost (agorot)'), '20000');
  await user.type(screen.getByLabelText('Customer-visible explanation'), 'Replace worn pump');
  await user.click(screen.getByRole('button', { name: 'Review additional quote' }));
  await user.click(screen.getByRole('button', { name: 'Send additional quote' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('260.00');
  await user.click(screen.getByRole('button', { name: 'Confirm send additional quote' }));
  expect(await screen.findByText(/Repair is paused/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Start repair without additional cost' })).not.toBeInTheDocument();
  expect(fetcher.mock.calls.find(([url]) => String(url).endsWith('/quote'))?.[1]?.body).toBe(JSON.stringify({ amount_agorot: 20000, explanation: 'Replace worn pump' }));
});
