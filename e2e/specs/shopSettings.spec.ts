import { expect } from '@playwright/test';
import { test, confirm, browserLogin, login } from '../fixtures/users';

test('edits shop settings and verifies customer contact, checkout, intake and role boundaries', async ({ page, request }, testInfo) => {
  const sessions: Record<string, { access_token: string }> = { admin: await browserLogin(page), customer: await login(request, '0500000003'), technician: await login(request, '0500000002') };
  const call = (path: string, data?: unknown, method = data === undefined ? 'GET' : 'POST', role = 'admin', key?: string) => request.fetch(`/api/v1${path}`, { method, data, headers: { Authorization: `Bearer ${sessions[role].access_token}`, ...(key ? { 'Idempotency-Key': key } : {}) } });
  const api = async (...args: Parameters<typeof call>) => { const result = await call(...args); expect(result.ok(), await result.text()).toBe(true); return result.json(); };
  const initial = await api('/admin/shop-settings');
  const intake = await api('/admin/service-intake-settings');
  await page.goto('/configuration/shop');
  await page.getByLabel('דמי משלוח בשקלים').fill('40.01');
  await page.getByLabel('רחוב', { exact: true }).fill('הרצל');
  await page.getByLabel('מספר בית', { exact: true }).fill('12');
  await page.getByLabel('עיר', { exact: true }).fill('חיפה');
  await page.getByLabel('מיקוד (לא חובה)').fill('3300000');
  await page.getByLabel('טלפון', { exact: true }).fill('+97231234567');
  await page.getByLabel('WhatsApp', { exact: true }).fill('+972501234567');
  await page.getByLabel('דואר אלקטרוני', { exact: true }).fill('shop@example.com');
  await page.getByLabel('שעות פעילות ללקוחות').fill('א–ה 09:00–17:00\nשישי סגור');
  await page.getByRole('button', { name: 'סקירת השינויים', exact: true }).click();
  expect((await api('/admin/shop-settings')).version).toBe(initial.version);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('region', { name: 'השוואת ערכים' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('shop-settings-review-phone.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await confirm(page, 'שמירת הגדרות החנות');
  await expect(page.getByRole('status')).toHaveText('הגדרות החנות נשמרו.');
  const saved = await api('/admin/shop-settings');
  expect(saved.shipping_fee_agorot).toBe(4001);
  const info = await api('/app-info', undefined, 'GET', 'customer');
  expect(info).toMatchObject({ email: 'shop@example.com', phone: '+97231234567', whatsapp: '+972501234567', opening_hours: 'א–ה 09:00–17:00\nשישי סגור', address: { city: 'חיפה', street: 'הרצל', building: '12', postal_code: '3300000' } });
  expect(info.version).toBeUndefined();
  expect(await api('/admin/service-intake-settings')).toEqual(intake);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('shop-settings-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('shop-settings-phone.png'), fullPage: true });

  const category = await api('/admin/categories', { name_he: 'בדיקת חנות', slug: 'shop-settings-test' });
  const product = await api('/admin/products', { category_id: category.id, name_he: 'מוצר בדיקה', description_he: 'בדיקה', product_type: 'coffee' });
  const sku = await api(`/admin/products/${product.id}/skus`, { sku_code: 'SHOP-SETTINGS', price_agorot: 1000 });
  await api('/cart/items', { sku_id: sku.id, quantity: 1 }, 'POST', 'customer');
  const address = { recipient_name: 'בדיקה', phone: '0500000001', street: 'בדיקה', building: '1', city: 'חיפה', country: 'IL' };
  const rejected = await call('/checkout', { address, expected_shipping_agorot: 3000 }, 'POST', 'customer', 'stale');
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).code).toBe('SHIPPING_FEE_CHANGED');
  expect(await api('/orders', undefined, 'GET', 'customer')).toEqual([]);
  const cart = await api('/cart', undefined, 'GET', 'customer');
  const checkout = await api('/checkout', { address, expected_shipping_agorot: cart.shipping_agorot }, 'POST', 'customer', 'reviewed');
  expect(checkout.order.total_agorot).toBe(5001);

  const model = await api('/admin/machine-models', { manufacturer: 'Test', model_name: 'Shop' });
  const machine = await api('/machines', { machine_model_id: model.id, serial_number: 'SHOP-TEST' }, 'POST', 'customer');
  const type = await api('/admin/service-types', { label_he: 'תיקון בדיקה', label_en: 'Repair', diagnostic_fee_agorot: 1000, machine_model_ids: [model.id] });
  const service = await api(`/machines/${machine.id}/service-requests`, { service_type_id: type.id, description: 'בדיקה של כתובת החנות', location_mode: 'bring_in' }, 'POST', 'customer');
  expect(service.address_snapshot.street).toBe('הרצל');
  const changed = await api('/admin/shop-settings', { ...saved, shop_address: { ...saved.shop_address, street: 'הנמל' }, shipping_fee_agorot: 0 }, 'PUT');
  expect((await api(`/service-requests/${service.id}`, undefined, 'GET', 'customer')).address_snapshot.street).toBe('הרצל');
  expect((await api(`/machines/${machine.id}/service-options`, undefined, 'GET', 'customer')).shop_address.street).toBe('הנמל');
  expect((await api('/checkout', { address, expected_shipping_agorot: cart.shipping_agorot }, 'POST', 'customer', 'reviewed')).order).toEqual(checkout.order);
  for (const role of ['customer', 'technician']) {
    expect((await call('/admin/shop-settings', undefined, 'GET', role)).status()).toBe(403);
    expect((await call('/admin/shop-settings', changed, 'PUT', role)).status()).toBe(403);
  }
});
