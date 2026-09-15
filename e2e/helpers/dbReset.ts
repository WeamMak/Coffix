import { expect, type APIRequestContext } from '@playwright/test';
export function controlHeaders() {
  const secret = process.env.E2E_CONTROL_SECRET;
  if (!secret) throw new Error('Run scripts/e2e-local.sh to provide isolated controls');
  return { 'X-E2E-Secret': secret };
}
export async function control(request: APIRequestContext, path: string, data?: unknown) {
  const response = await request.post(`/api/v1/__e2e${path}`, { headers: controlHeaders(), data });
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return response.json();
}
export const reset = (request: APIRequestContext) => control(request, '/reset');
