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
  await user.click(screen.getByRole('button', { name: 'סקירת שינוי הרשאות' }));
  expect(screen.getByRole('region', { name: 'סקירת שינוי הרשאות' })).toHaveTextContent('טכנאי → לקוח');
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'אישור שינוי הרשאות' }));
  await waitFor(() => expect(fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1]?.body).toBe(JSON.stringify({ role: 'customer', is_active: true })));
});

it('lists only the assigned-job API response and opens a job from its responsive card', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/jobs', (url) => Response.json(url.pathname.endsWith('/jobs') ? [{ ...service, state: 'scheduled' }] : service), 'technician');
  await user.click(await screen.findByRole('link', { name: 'SVC-27001' }));
  expect(await screen.findByText('SERIAL-27')).toBeVisible();
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('/admin/'))).toBe(false);
});


it('invalidates an access review when the draft changes and explains deactivation', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/people', () => Response.json([staffUser]));
  await user.click(await screen.findByRole('button', { name: 'ניהול Dana' }));
  expect(screen.getByText(/השבתת החשבון חוסמת גישה ושומרת/)).toBeVisible();
  expect(screen.getByText(/רכישה וניהול המכונות/)).toBeVisible();
  await user.selectOptions(screen.getByLabelText('תפקיד'), 'admin');
  await user.click(screen.getByRole('button', { name: 'סקירת שינוי הרשאות' }));
  expect(screen.getByRole('region', { name: 'סקירת שינוי הרשאות' })).toHaveTextContent('טכנאי → מנהל');
  await user.click(screen.getByLabelText('חשבון פעיל'));
  expect(screen.queryByRole('button', { name: 'אישור שינוי הרשאות' })).not.toBeInTheDocument();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'סקירת שינוי הרשאות' }));
  expect(screen.getByRole('region', { name: 'סקירת שינוי הרשאות' })).toHaveTextContent('פעיל → לא פעיל');
  await user.click(screen.getByRole('button', { name: 'אישור שינוי הרשאות' }));
  await waitFor(() => expect(fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1]?.body).toBe(JSON.stringify({ role: 'admin', is_active: false })));
});

it('explains and prevents removal of the signed-in administrator access', async () => {
  const user = userEvent.setup();
  commercePage('/people', () => Response.json([{ ...staffUser, id: 'admin-1', role: 'admin' }]));
  await user.click(await screen.findByRole('button', { name: 'ניהול Dana' }));
  expect(screen.getByText('לא ניתן להסיר את הרשאות הניהול של עצמכם.')).toBeVisible();
  expect(screen.getByLabelText('תפקיד')).toBeDisabled();
  expect(screen.getByLabelText('חשבון פעיל')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'סקירת שינוי הרשאות' })).toBeDisabled();
});
