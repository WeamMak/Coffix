import { expect } from '@playwright/test';
import { actors, api, call, refresh, test } from '../fixtures/users';
import { catalog } from '../fixtures/catalog';
import { checkout } from '../fixtures/commerce';
import { advance } from '../helpers/clock';
import { paymentEvent, workers } from '../helpers/fakeProviders';

test('simultaneous customers cannot reserve the same last machine', async ({ request }) => {
  const a = await actors(request);
  const { sku } = await catalog(request, a.admin, 1);
  const responses = await Promise.all([a.customer, a.other].map(token => call(request, token, '/cart/items', { sku_id: sku.id, quantity: 1 })));
  expect(responses.map(r => r.status()).sort()).toEqual([201, 409]);
  const failed = responses.find(r => r.status() === 409)!;
  expect((await failed.json()).code).toBe('INSUFFICIENT_STOCK');
  const inventory = await api(request, a.admin, '/admin/inventory');
  expect(inventory[0]).toMatchObject({ reserved_quantity: 1, available_quantity: 0 });
});

test('signed duplicate payment finalizes once, registers one warranted machine, and admin fully refunds', async ({ request }) => {
  const a = await actors(request);
  const { sku } = await catalog(request, a.admin);
  const order = await checkout(request, a.customer, sku.id);
  await paymentEvent(request, order.payment.provider_payment_id, 'paid-one');
  expect((await paymentEvent(request, order.payment.provider_payment_id, 'paid-one')).result).toBe('duplicate');
  expect((await api(request, a.customer, `/orders/${order.order.id}`)).state).toBe('paid');
  const machines = await api(request, a.customer, '/machines');
  expect(machines).toHaveLength(1);
  expect(machines[0]).toMatchObject({ source: 'order', warranty_status: 'active', warranty_months: 12 });
  expect((await api(request, a.admin, '/admin/inventory'))[0]).toMatchObject({ stock_quantity: 1, reserved_quantity: 0 });
  const refund = await api(request, a.admin, `/admin/orders/${order.order.id}/refund`, { reason: 'החזר בדיקה מלא', confirm_order_number: order.order.order_number }, 'POST', 'refund-one');
  await paymentEvent(request, refund.provider_refund_id, 'refund-one', true);
  expect((await api(request, a.customer, `/orders/${order.order.id}`)).state).toBe('refunded');
  await workers(request);
  const notifications = await api(request, a.customer, '/notifications');
  expect(notifications.some((item: { related_entity_id: string }) => item.related_entity_id === order.order.id)).toBe(true);
});

test('unpaid order expiry and inactive cart expiry release stock deterministically', async ({ request }) => {
  const a = await actors(request);
  const { sku } = await catalog(request, a.admin);
  const order = await checkout(request, a.customer, sku.id);
  await api(request, a.other, '/cart/items', { sku_id: sku.id, quantity: 1 });
  await advance(request, 1801);
  const first = await workers(request);
  expect(first.expiration.expired_count).toBe(1);
  const customer = await refresh(request, a.sessions.customer);
  expect((await api(request, customer.access_token, `/orders/${order.order.id}`)).state).toBe('payment_expired');
  await advance(request, 1800);
  const second = await workers(request);
  expect(second.expiration.released_quantity).toBe(1);
  const admin = await refresh(request, a.sessions.admin);
  expect((await api(request, admin.access_token, '/admin/inventory'))[0]).toMatchObject({ stock_quantity: 2, reserved_quantity: 0, available_quantity: 2 });
  expect((await workers(request)).expiration.expired_count).toBe(0);
});
