import { expect } from '@playwright/test';
import { actors, api, browserLogin, call, test } from '../fixtures/users';
import { catalog } from '../fixtures/catalog';
import { checkout } from '../fixtures/commerce';
import { diagnose, intake } from '../fixtures/service';

test('ownership, technician escalation, customer cancellation and service payment boundaries', async ({ request }) => {
  const a = await actors(request);
  const { sku } = await catalog(request, a.admin);
  const { order } = await checkout(request, a.customer, sku.id);
  expect((await call(request, a.other, `/orders/${order.id}`)).status()).toBe(404);
  for (const token of [a.customer, a.technician]) {
    expect((await call(request, token, `/admin/orders/${order.id}/cancel`, { reason: 'בקשת ביטול', confirm_order_number: order.order_number })).status()).toBe(403);
    for (const path of ['/admin/users', '/admin/shop-settings', '/admin/notification-deliveries', '/admin/audit-logs']) {
      expect((await call(request, token, path)).status()).toBe(403);
    }
  }
  const { service, machine } = await intake(request, a.admin, a.customer);
  expect((await call(request, a.other, `/machines/${machine.id}`)).status()).toBe(404);
  expect((await call(request, a.other, `/service-requests/${service.id}`)).status()).toBe(404);
  expect((await call(request, a.technician, `/technician/jobs/${service.id}`)).status()).toBe(404);
  expect((await call(request, a.technician, `/admin/service-requests/${service.id}/diagnostic-fee`, { amount_agorot: 100 })).status()).toBe(403);
  await diagnose(request, a.admin, a.technician, a.customer, service.id);
  expect((await call(request, a.customer, `/service-requests/${service.id}/cancel`, undefined, 'POST')).status()).toBe(409);
  // No service refund endpoint exists for any role.
  expect((await call(request, a.admin, `/admin/service-requests/${service.id}/refund`, { reason: 'אסור' })).status()).toBe(404);
  expect((await api(request, a.customer, `/service-requests/${service.id}`)).state).toBe('diagnosing');
});

test('technician browser cannot navigate to admin operations', async ({ page }) => {
  await browserLogin(page, '0500000002');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/people', '/operations', '/operations/audit', '/configuration/shop']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'אין הרשאה' })).toBeVisible();
  }
});
