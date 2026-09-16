import { expect } from '@playwright/test';
import { actors, api, call, test } from '../fixtures/users';
import { control } from '../helpers/dbReset';

test('exhausted PostgreSQL pool rejects promptly and recovers after connections return', async ({ request }) => {
  const a = await actors(request);
  try {
    const held = await control(request, '/database/hold');
    expect(held.connections).toBe(15);
    const started = performance.now();
    const response = await call(request, a.customer, '/orders');
    expect(response.status()).toBe(503);
    const body = await response.json();
    expect(body.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(body.correlationId).not.toBe('unknown');
    expect(JSON.stringify(body)).not.toContain('postgresql');
    expect(performance.now() - started).toBeLessThan(5000);
    expect((await request.get(`${process.env.COFFIX_E2E_API_URL}/health/live`)).status()).toBe(200);
  } finally {
    await control(request, '/database/release');
  }
  await api(request, a.customer, '/orders');
  expect((await request.get(`${process.env.COFFIX_E2E_API_URL}/health/ready`)).status()).toBe(200);
});
