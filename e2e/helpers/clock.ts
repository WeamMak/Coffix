import { expect, type APIRequestContext } from '@playwright/test';
import { control, controlHeaders } from './dbReset';
export const advance = (request: APIRequestContext, seconds: number) => control(request, '/clock', { seconds });
export async function now(request: APIRequestContext): Promise<string> {
  const response = await request.get('/api/v1/__e2e/clock', { headers: controlHeaders() });
  expect(response.ok()).toBe(true);
  return (await response.json()).now;
}
