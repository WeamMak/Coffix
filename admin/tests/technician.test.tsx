import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { commercePage } from './commerceSupport';
import { service, staffUser } from './serviceSupport';

it('opens assigned job context, posts internal notes and exposes only allowed operational actions', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/jobs/service-1', () => Response.json({ ...service, state: 'received', allowed_actions: ['start_diagnosis'] }), 'technician');
  expect(await screen.findByText('SERIAL-27')).toBeVisible();
  expect(screen.getByRole('button', { name: 'התחלת אבחון' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'סיום השירות' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('למי ההערה גלויה')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('עלות נוספת בסיסית באגורות')).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('הערה'), 'Valve needs inspection');
  await user.click(screen.getByRole('button', { name: 'הוספת הערה' }));
  await waitFor(() => expect(fetcher.mock.calls.find(([url]) => String(url).endsWith('/notes'))?.[1]?.body).toBe(JSON.stringify({ body: 'Valve needs inspection' })));
  expect(screen.getByLabelText('תמונת עבודה')).toBeVisible();
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('/admin/'))).toBe(false);
});

it('requires confirmation before an administrator changes a person’s access', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/people', () => Response.json([staffUser]));
  await user.click(await screen.findByRole('button', { name: 'ניהול Dana' }));
  await user.selectOptions(screen.getByLabelText('תפקיד'), 'customer');
  await user.click(screen.getByRole('button', { name: 'סקירת שינוי גישה' }));
  await user.click(screen.getByRole('button', { name: 'שינוי גישה' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('לקוח');
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'אישור: שינוי גישה' }));
  await waitFor(() => expect(fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1]?.body).toBe(JSON.stringify({ role: 'customer', is_active: true })));
});

it('lists only the assigned-job API response and opens a job from its responsive card', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/jobs', (url) => Response.json(url.pathname.endsWith('/jobs') ? [{ ...service, state: 'scheduled' }] : service), 'technician');
  await user.click(await screen.findByRole('link', { name: 'SVC-27001' }));
  expect(await screen.findByText('SERIAL-27')).toBeVisible();
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('/admin/'))).toBe(false);
});
