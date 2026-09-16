import { expect } from '@playwright/test';
import { api, browserLogin, login, test } from '../fixtures/users';
import { reset, controlHeaders } from '../helpers/dbReset';
import { advance, now } from '../helpers/clock';

test('reset restores seed and clock, clears auth cooldown, and requires a separate secret', async ({ request }) => {
  const initial = await now(request);
  expect(initial).toBe('2026-01-05T10:00:00+00:00');
  const before = await login(request, '0500000003');
  await api(request, before.access_token, '/users/me', { display_name: 'שינוי זמני' }, 'PATCH');
  await advance(request, 3601);
  expect(await now(request)).toBe('2026-01-05T11:00:01+00:00');
  expect((await request.post('/api/v1/__e2e/reset')).status()).toBe(403);
  expect((await request.post('/api/v1/__e2e/reset', { headers: { 'X-E2E-Secret': 'wrong' } })).status()).toBe(403);
  await reset(request);
  expect(await now(request)).toBe(initial);
  // Reset also invalidates fake-provider challenges, not just persisted sessions.
  expect((await request.post('/api/v1/auth/otp/verify', { data: { phone: '0500000003', code: '123456' } })).status()).toBe(401);
  const after = await login(request, '0500000003');
  expect((await api(request, after.access_token, '/users/me')).display_name).toBe('לקוח בדיקה');
  expect((await request.get('/api/v1/users/me', { headers: { Authorization: `Bearer ${before.access_token}` } })).status()).toBe(401);
  expect((await request.post('/api/v1/__e2e/payments', { headers: { ...controlHeaders(), 'Stripe-Signature': 't=0,v1=wrong' }, data: {} })).status()).toBe(400);
  expect((await request.post('/api/v1/test/payments/webhooks', { data: { event_id: 'unsigned', event_type: 'payment_intent.succeeded', provider_object_id: 'fake', state: 'confirmed' } })).status()).toBe(404);
});

test('OTP login, role-aware browser session restoration and logout use real HTTP', async ({ page, request }) => {
  expect((await request.get('/api/v1/catalog/categories')).status()).toBe(401);
  await browserLogin(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible();
  await page.getByRole('button', { name: 'התנתקות' }).click();
  await expect(page.getByLabel('מספר טלפון')).toBeVisible();
  const customer = await login(request, '0500000005');
  expect((await api(request, customer.access_token, '/users/me')).role).toBe('customer');
  expect((await request.post('/api/v1/auth/otp/request', { data: { phone: '0500000005' } })).status()).toBe(429);
});
