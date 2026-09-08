import { expect, test as base, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import type { components } from '@coffix/api-client';
export type Schema = components['schemas'];

export async function api(request: APIRequestContext, token: string, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', key?: string) {
  const response = await request.fetch(`/api/v1${path}`, { method, data: body, headers: { Authorization: `Bearer ${token}`, ...(key ? { 'Idempotency-Key': key } : {}) } });
  const problem = response.ok() ? null : await response.json().catch(() => null);
  expect(response.ok(), `${method} ${path}: ${response.status()} ${problem?.code ?? ''} ${problem?.title ?? ''}`).toBe(true);
  return response;
}
async function login(page: Page, phone: string) {
  await page.goto('/');
  await page.getByLabel('Phone number').fill(phone);
  const sent = page.waitForResponse((response) => response.url().endsWith('/auth/web/otp/request'));
  await page.getByRole('button', { name: 'Send code' }).click();
  expect((await sent).ok(), 'Fake OTP request must succeed; respect the local cooldown between runs.').toBe(true);
  await page.getByLabel('Verification code').fill('123456');
  const response = page.waitForResponse((response) => response.url().endsWith('/auth/web/otp/verify'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const verified = await response;
  expect(verified.ok()).toBe(true);
  const session: Schema['WebSession'] = await verified.json();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  return session;
}
type Staff = { admin: BrowserContext; technician: BrowserContext; adminSession: Schema['WebSession']; technicianSession: Schema['WebSession'] };
export const test = base.extend<object, { staff: Staff }>({
  staff: [async ({ browser }, provide) => {
    const admin = await browser.newContext({ baseURL: 'http://localhost:5173' });
    const technician = await browser.newContext({ baseURL: 'http://localhost:5173', viewport: { width: 390, height: 844 } });
    admin.setDefaultTimeout(15_000);
    technician.setDefaultTimeout(15_000);
    try {
      const adminPage = await admin.newPage();
      const techPage = await technician.newPage();
      const adminSession = await login(adminPage, '0500000001');
      const technicianSession = await login(techPage, '0500000002');
      await adminPage.close(); await techPage.close();
      await provide({ admin, technician, adminSession, technicianSession });
    } finally { await admin.close(); await technician.close(); }
  }, { scope: 'worker' }],
});

export async function createCustomer(request: APIRequestContext, phone: string) {
  const sent = await request.post('/api/v1/auth/otp/request', { data: { phone } });
  expect(sent.ok()).toBe(true);
  const verified = await request.post('/api/v1/auth/otp/verify', { data: { phone, code: '123456' } });
  expect(verified.ok()).toBe(true);
  const tokens: Schema['AuthTokens'] = await verified.json();
  await api(request, tokens.access_token, '/users/me', { display_name: 'Task 27 Customer' }, 'PATCH');
  return tokens.access_token;
}
export async function confirm(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: `Confirm ${label.toLowerCase()}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
