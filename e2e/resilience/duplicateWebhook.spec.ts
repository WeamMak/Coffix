import { expect } from '@playwright/test';
import { actors, api, test } from '../fixtures/users';
import { catalog } from '../fixtures/catalog';
import { checkout } from '../fixtures/commerce';
import { paymentEvent } from '../helpers/fakeProviders';

test('concurrent duplicates and late failure cannot regress a paid or refunded order', async ({ request }) => {
  const a = await actors(request);
  const { sku } = await catalog(request, a.admin, 1);
  const order = await checkout(request, a.customer, sku.id);
  const results = await Promise.all(Array.from({ length: 8 }, () => paymentEvent(request, order.payment.provider_payment_id, 'concurrent-paid')));
  expect(results.filter(result => result.result === 'duplicate')).toHaveLength(7);
  await paymentEvent(request, order.payment.provider_payment_id, 'late-failure', false, 'failed');
  expect((await api(request, a.customer, `/orders/${order.order.id}`)).state).toBe('paid');
  expect(await api(request, a.customer, '/machines')).toHaveLength(1);
  expect((await api(request, a.admin, '/admin/inventory'))[0]).toMatchObject({ stock_quantity: 0, reserved_quantity: 0 });
  const refund = await api(request, a.admin, `/admin/orders/${order.order.id}/refund`, { reason: 'בדיקת אירועים', confirm_order_number: order.order.order_number }, 'POST', 'reordered-refund');
  await paymentEvent(request, refund.provider_refund_id, 'refund-confirmed', true);
  await paymentEvent(request, order.payment.provider_payment_id, 'very-late-success');
  expect((await api(request, a.customer, `/orders/${order.order.id}`)).state).toBe('refunded');
  expect(await api(request, a.customer, '/machines')).toHaveLength(1);
});
