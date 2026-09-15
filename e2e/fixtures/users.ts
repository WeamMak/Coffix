import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import type { components } from '@coffix/api-client';
import { reset } from '../helpers/dbReset';
export type Schema = components['schemas'];
export async function call(request: APIRequestContext, token: string, path: string, data?: unknown, method = data === undefined ? 'GET' : 'POST', key?: string) {
  return request.fetch(`/api/v1${path}`, { method, data, headers: { Authorization: `Bearer ${token}`, ...(key ? { 'Idempotency-Key': key } : {}) } });
}
export async function api(...args: Parameters<typeof call>) {
  const response = await call(...args);
  expect(response.ok(), `${args[2]}: ${await response.text()}`).toBe(true);
  return response.status() === 204 ? null : response.json();
}
export async function login(request: APIRequestContext, phone: string): Promise<Schema['AuthTokens']> {
  const sent = await request.post('/api/v1/auth/otp/request', { data: { phone } });
  expect(sent.ok(), await sent.text()).toBe(true);
  const result = await request.post('/api/v1/auth/otp/verify', { data: { phone, code: '123456' } });
  expect(result.ok(), await result.text()).toBe(true);
  return result.json();
}
export async function browserLogin(page: Page, phone = '0500000001') {
  await page.goto('/');
  await page.getByLabel('מספר טלפון').fill(phone);
  await page.getByRole('button', { name: 'שליחת קוד' }).click();
  await page.getByLabel('קוד אימות').fill('123456');
  const verified = page.waitForResponse(response => response.url().endsWith('/auth/web/otp/verify'));
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  const response = await verified;
  expect(response.ok()).toBe(true);
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible();
  return response.json() as Promise<Schema['WebSession']>;
}
export async function confirm(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: `אישור: ${label}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
export const test = base.extend<{ isolated: void }>({
  isolated: [async ({ request }, use) => {
    await reset(request);
    await use();
  }, { auto: true }],
});
export async function actors(request: APIRequestContext) {
  const admin = await login(request, '0500000001');
  const technician = await login(request, '0500000002');
  const customer = await login(request, '0500000003');
  const other = await login(request, '0500000004');
  await api(request, other.access_token, '/users/me', { display_name: 'לקוח נוסף' }, 'PATCH');
  return { admin: admin.access_token, technician: technician.access_token, customer: customer.access_token, other: other.access_token, sessions: { admin, technician, customer, other } };
}

export async function refresh(request: APIRequestContext, tokens: Schema['AuthTokens']): Promise<Schema['AuthTokens']> {
  const response = await request.post('/api/v1/auth/refresh', { data: { refresh_token: tokens.refresh_token } });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
