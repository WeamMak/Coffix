import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';
import { actors, api, login, refresh, test } from '../fixtures/users';
import { catalog } from '../fixtures/catalog';
import { checkout } from '../fixtures/commerce';
import { advance, now } from '../helpers/clock';
import { paymentEvent } from '../helpers/fakeProviders';

async function worker(mode: string, timestamp: string, killAfterClaim = false) {
  const root = resolve(__dirname, '../..');
  return new Promise<Record<string, number>>((resolveResult, reject) => {
    const child = spawn(`${root}/backend/.venv/bin/python`, ['-m', 'e2e.resilience.worker', mode, timestamp], { cwd: root });
    let output = '';
    let error = '';
    let killed = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Worker timed out')); }, 15_000);
    child.stdout.on('data', data => {
      output += String(data);
      if (killAfterClaim && output.includes('\n') && !killed) {
        killed = true;
        child.kill('SIGKILL');
      }
    });
    child.stderr.on('data', data => { error += String(data); });
    child.on('error', reason => { clearTimeout(timer); reject(reason); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 && !(killed && signal === 'SIGKILL')) return reject(new Error(`Worker failed: ${error}`));
      try { resolveResult(JSON.parse(output)); } catch (reason) { reject(reason); }
    });
  });
}

test('worker killed after committed claims delivers every event once after restart and lease expiry', async ({ request }) => {
  const a = await actors(request);
  const { sku } = await catalog(request, a.admin);
  const order = await checkout(request, a.customer, sku.id);
  await paymentEvent(request, order.payment.provider_payment_id, 'restart-paid');
  await advance(request, 1); // Include the monotonically ordered order.paid event.
  const claimed = await worker('claim', await now(request), true);
  expect(claimed.claimed).toBe(2);
  expect(await api(request, a.customer, '/notifications')).toHaveLength(0);
  expect((await worker('outbox', await now(request))).processed_count).toBe(0);
  await advance(request, 301);
  expect((await worker('outbox', await now(request))).processed_count).toBe(claimed.claimed);
  const notifications = await api(request, a.customer, '/notifications');
  expect(notifications.filter((item: { related_entity_id: string }) => item.related_entity_id === order.order.id)).toHaveLength(2);
  expect(notifications.map((item: { type: string }) => item.type).sort()).toEqual(['order.created', 'order.paid']);
  expect((await worker('outbox', await now(request))).processed_count).toBe(0);
  expect(await api(request, a.customer, '/notifications')).toEqual(notifications);
});

test('expired cart backlog drains across bounded worker batches without double release', async ({ request }) => {
  const a = await actors(request);
  const { sku } = await catalog(request, a.admin, 12);
  for (let index = 5; index < 17; index++) {
    const customer = await login(request, `05000000${String(index).padStart(2, '0')}`);
    await api(request, customer.access_token, '/users/me', { display_name: 'לקוח תפוגה' }, 'PATCH');
    await api(request, customer.access_token, '/cart/items', { sku_id: sku.id, quantity: 1 });
  }
  await advance(request, 3601);
  for (const count of [5, 5, 2, 0]) {
    const result = await worker('expiration', await now(request));
    expect(result.expired_count).toBe(count);
    expect(result.released_quantity).toBe(count);
  }
  const admin = await refresh(request, a.sessions.admin);
  expect((await api(request, admin.access_token, '/admin/inventory'))[0]).toMatchObject({
    stock_quantity: 12, reserved_quantity: 0, available_quantity: 12,
  });
});
