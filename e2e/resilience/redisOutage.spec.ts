import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';
import { actors, api, test } from '../fixtures/users';

const exec = promisify(execFile);

async function redis(action: 'pause' | 'unpause') {
  const run = process.env.COFFIX_E2E_RUN_ID;
  if (!run || !/^[a-f0-9]{16}$/.test(run)) throw new Error('Isolated runner required');
  await exec('docker', ['compose', '-f', resolve(__dirname, '../../compose.e2e.yaml'), '-p', `coffix-e2e-${run}`, action, 'redis'], { timeout: 30_000 });
}

test('Redis outage fails closed, preserves reads and recovers without restarting the API', async ({ request }) => {
  const a = await actors(request);
  const apiUrl = process.env.COFFIX_E2E_API_URL;
  try {
    await redis('pause');
    const ready = await request.get(`${apiUrl}/health/ready`);
    expect(ready.status()).toBe(503);
    expect((await ready.json()).checks.redis.status).toBe('failed');
    expect((await request.get(`${apiUrl}/health/live`)).status()).toBe(200);
    await api(request, a.customer, '/orders');
    const started = performance.now();
    const otp = await request.post('/api/v1/auth/otp/request', { data: { phone: '0500000019' }, timeout: 5000 });
    expect(otp.status()).toBe(503);
    expect((await otp.json()).code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(performance.now() - started).toBeLessThan(5000);
  } finally {
    await redis('unpause');
    await expect.poll(async () => (await request.get(`${apiUrl}/health/ready`)).status()).toBe(200);
  }
  expect((await request.post('/api/v1/auth/otp/request', { data: { phone: '0500000019' } })).status()).toBe(202);
});
