import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { commercePage, stock } from './commerceSupport';

it('shows reservations and confirms a correction from tracked stock to unlimited', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/catalog/inventory', (_, init) => Response.json(init?.method === 'POST' ? { ...stock, stock_quantity: null, available_quantity: null } : [stock]));
  const table = await screen.findByRole('table', { name: 'מלאי' });
  expect(within(table).getByRole('cell', { name: '3' })).toBeVisible();
  expect(within(table).getByRole('cell', { name: '7' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'עדכון BEANS-1' }));
  await user.click(screen.getByLabelText('מלאי ללא הגבלה'));
  await user.click(screen.getByRole('button', { name: 'סקירת עדכון המלאי' }));
  expect(screen.getByLabelText('סיבה')).toBeInvalid();
  await user.type(screen.getByLabelText('סיבה'), 'Counted delivery');
  await user.click(screen.getByRole('button', { name: 'סקירת עדכון המלאי' }));
  await user.click(screen.getByRole('button', { name: 'החלת עדכון מלאי' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('10 → ללא הגבלה');
  await user.click(screen.getByRole('button', { name: 'אישור: החלת עדכון מלאי' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/corrections') && init?.body === JSON.stringify({ quantity: null, expected_quantity: 10, reason: 'Counted delivery' }))).toBe(true));
});

it('rejects stock below reserved quantity and preserves a correction after a concurrent stock conflict', async () => {
  const { problem } = await import('./commerceSupport');
  const user = userEvent.setup();
  const fetcher = commercePage('/catalog/inventory', (_, init) => init?.method === 'POST' ? problem('stock_changed', 'Stock changed since it was loaded') : Response.json([stock]));
  await user.click(await screen.findByRole('button', { name: 'עדכון BEANS-1' }));
  await user.clear(screen.getByLabelText('כמות כוללת חדשה')); await user.type(screen.getByLabelText('כמות כוללת חדשה'), '2');
  await user.type(screen.getByLabelText('סיבה'), 'Counted shelf');
  await user.click(screen.getByRole('button', { name: 'סקירת עדכון המלאי' }));
  expect(screen.getByLabelText('כמות כוללת חדשה')).toBeInvalid();
  await user.clear(screen.getByLabelText('כמות כוללת חדשה')); await user.type(screen.getByLabelText('כמות כוללת חדשה'), '12');
  await user.click(screen.getByRole('button', { name: 'סקירת עדכון המלאי' }));
  await user.click(screen.getByRole('button', { name: 'החלת עדכון מלאי' }));
  await user.click(screen.getByRole('button', { name: 'אישור: החלת עדכון מלאי' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('הרשומה השתנתה');
  expect(screen.getByLabelText('כמות כוללת חדשה')).toHaveValue(12);
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/corrections'))).toHaveLength(1);
});
