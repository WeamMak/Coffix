import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { commercePage, stock } from './commerceSupport';

it('shows reservations and confirms a correction from tracked stock to unlimited', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/catalog/inventory', (_, init) => Response.json(init?.method === 'POST' ? { ...stock, stock_quantity: null, available_quantity: null } : [stock]));
  const table = await screen.findByRole('table', { name: 'Inventory' });
  expect(within(table).getByRole('cell', { name: '3' })).toBeVisible();
  expect(within(table).getByRole('cell', { name: '7' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Adjust BEANS-1' }));
  await user.click(screen.getByLabelText('Unlimited stock'));
  await user.click(screen.getByRole('button', { name: 'Review correction' }));
  expect(screen.getByLabelText('Reason')).toBeInvalid();
  await user.type(screen.getByLabelText('Reason'), 'Counted delivery');
  await user.click(screen.getByRole('button', { name: 'Review correction' }));
  await user.click(screen.getByRole('button', { name: 'Apply stock correction' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('10 → Unlimited');
  await user.click(screen.getByRole('button', { name: 'Confirm apply stock correction' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/corrections') && init?.body === JSON.stringify({ quantity: null, expected_quantity: 10, reason: 'Counted delivery' }))).toBe(true));
});

it('rejects stock below reserved quantity and preserves a correction after a concurrent stock conflict', async () => {
  const { problem } = await import('./commerceSupport');
  const user = userEvent.setup();
  const fetcher = commercePage('/catalog/inventory', (_, init) => init?.method === 'POST' ? problem('stock_changed', 'Stock changed since it was loaded') : Response.json([stock]));
  await user.click(await screen.findByRole('button', { name: 'Adjust BEANS-1' }));
  await user.clear(screen.getByLabelText('New total stock')); await user.type(screen.getByLabelText('New total stock'), '2');
  await user.type(screen.getByLabelText('Reason'), 'Counted shelf');
  await user.click(screen.getByRole('button', { name: 'Review correction' }));
  expect(screen.getByLabelText('New total stock')).toBeInvalid();
  await user.clear(screen.getByLabelText('New total stock')); await user.type(screen.getByLabelText('New total stock'), '12');
  await user.click(screen.getByRole('button', { name: 'Review correction' }));
  await user.click(screen.getByRole('button', { name: 'Apply stock correction' }));
  await user.click(screen.getByRole('button', { name: 'Confirm apply stock correction' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Stock changed');
  expect(screen.getByLabelText('New total stock')).toHaveValue(12);
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/corrections'))).toHaveLength(1);
});
