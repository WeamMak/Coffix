import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { components } from '@coffix/api-client';

type Schema = components['schemas'];
async function login(page: Page, phone: string) {
  await page.goto('/');
  await page.getByLabel('מספר טלפון').fill(phone);
  await page.getByRole('button', { name: 'שליחת קוד' }).click();
  await page.getByLabel('קוד אימות').fill('123456');
  const response = page.waitForResponse((response) => response.url().endsWith('/auth/web/otp/verify'));
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  const verified = await response;
  expect(verified.status()).toBe(200);
  const session: Schema['WebSession'] = await verified.json();
  await expect(page.getByRole('button', { name: 'התנתקות' })).toBeVisible();
  return session.access_token;
}
async function api(request: APIRequestContext, token: string, path: string, data?: unknown, method = data === undefined ? 'GET' : 'POST', key?: string) {
  const result = await request.fetch(`/api/v1${path}`, { method, data, headers: { Authorization: `Bearer ${token}`, ...(key ? { 'Idempotency-Key': key } : {}) } });
  expect(result.ok(), `${method} ${path} returned ${result.status()}`).toBe(true);
  return result;
}

test('admin catalog, reserved stock, order shipment, cancellation and confirmed full refund', async ({ page, request }) => {
  test.setTimeout(120_000);
  const token = await login(page, '0500000001');
  const suffix = Date.now().toString();
  const customerPhone = `055${suffix.slice(-7)}`;
  const name = `קפה בדיקה ${suffix}`;
  const code = `BROWSER-${suffix}`;
  await page.getByRole('link', { name: 'קטלוג', exact: true }).click();
  await page.getByRole('link', { name: 'קטגוריות', exact: true }).click();
  await page.getByRole('button', { name: 'קטגוריה חדשה' }).click();
  await page.getByLabel('שם בעברית').fill(name);
  await page.getByLabel('מזהה קטגוריה', { exact: true }).fill(`browser-${suffix}`);
  await page.getByRole('button', { name: 'שמירת קטגוריה' }).click();
  await expect(page.getByRole('heading', { name: 'קטגוריה חדשה' })).toHaveCount(0);
  await page.getByRole('link', { name: 'מוצרים', exact: true }).click();
  await page.getByRole('link', { name: 'מוצר חדש' }).click();
  await page.getByLabel('חיפוש קטגוריה').fill(name);
  await page.getByLabel('קטגוריה', { exact: true }).selectOption({ label: name });
  await page.getByLabel('שם בעברית').fill(name);
  await page.getByLabel('תיאור בעברית').fill('מוצר בדיקה לדפדפן');
  await page.getByLabel('סוג מוצר').fill('beans');
  await page.getByRole('button', { name: 'שמירת מוצר' }).click();
  await expect(page).toHaveURL(/\/catalog\/products\/[a-f0-9-]+$/);
  const productId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: 'מק״ט חדש' }).click();
  await page.getByLabel('קוד מק״ט').fill(code);
  await page.getByLabel('מחיר באגורות').fill('12550');
  await page.getByLabel('מלאי ללא הגבלה').uncheck();
  await page.getByLabel('מלאי התחלתי').fill('10');
  await page.getByRole('button', { name: 'שמירת מק״ט', exact: true }).click();
  await page.getByRole('button', { name: 'החלת שינויים במק״ט', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('125.50');
  await page.getByRole('button', { name: 'אישור: החלת שינויים במק״ט' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const product: Schema['AdminProductRead'] = await (await api(request, token, `/admin/products/${productId}`)).json();
  const sku = product.skus[0];

  // A second operator changes the record after the browser loaded it.
  await api(request, token, `/admin/products/${productId}`, { version: product.version, admin_label_en: 'Edited by another administrator' }, 'PATCH');
  await page.getByLabel('תווית באנגלית').fill('My stale edit');
  await page.getByRole('button', { name: 'שמירת מוצר' }).click();
  await expect(page.getByRole('alert')).toContainText('הרשומה השתנתה');
  await expect(page.getByLabel('תווית באנגלית')).toHaveValue('My stale edit');
  await page.getByRole('button', { name: 'טעינת המוצר מחדש וביטול השינויים' }).click();
  await expect(page.getByLabel('תווית באנגלית')).toHaveValue('Edited by another administrator');

  const otpRequest = await request.post('/api/v1/auth/otp/request', { data: { phone: customerPhone } });
  expect(otpRequest.ok(), `Customer OTP request returned ${otpRequest.status()}`).toBe(true);
  const verified = await request.post('/api/v1/auth/otp/verify', { data: { phone: customerPhone, code: '123456' } });
  expect(verified.ok()).toBe(true);
  const customer = (await verified.json()).access_token as string;
  await api(request, customer, '/users/me', { display_name: 'Browser Customer' }, 'PATCH');
  await api(request, customer, '/cart/items', { sku_id: sku.id, quantity: 2 });
  await page.getByRole('link', { name: 'מלאי', exact: true }).click();
  await page.getByLabel('חיפוש', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'חיפוש', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: code });
  await expect(row.getByRole('cell', { name: '2', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: '8', exact: true })).toBeVisible();
  await page.getByRole('button', { name: `עדכון ${code}` }).click();
  await page.getByLabel('כמות כוללת חדשה').fill('8');
  await page.getByLabel('סיבה').fill('Counted browser test shelf');
  await page.getByRole('button', { name: 'סקירת עדכון המלאי' }).click();
  await page.getByRole('button', { name: 'החלת עדכון מלאי', exact: true }).click();
  await page.getByRole('button', { name: 'אישור: החלת עדכון מלאי' }).click();
  await expect(row.getByRole('cell', { name: '6', exact: true })).toBeVisible();

  const address = { recipient_name: 'Browser Customer', phone: customerPhone, street: 'Coffee', building: '26', city: 'Tel Aviv', country: 'IL' };
  const checkout: Schema['CheckoutRead'] = await (await api(request, customer, '/checkout', { address }, 'POST', `checkout-${suffix}`)).json();
  const order = checkout.order;
  expect(order.allowed_actions).toEqual([]);
  const forbiddenCancel = await request.post(`/api/v1/admin/orders/${order.id}/cancel`, { headers: { Authorization: `Bearer ${customer}` }, data: { reason: 'Customer cancellation', confirm_order_number: order.order_number } });
  expect(forbiddenCancel.status()).toBe(403);
  await api(request, token, '/test/payments/webhooks', { event_id: `paid-${suffix}`, event_type: 'payment_intent.succeeded', provider_object_id: checkout.payment.provider_payment_id, state: 'confirmed' });
  await page.getByRole('link', { name: 'הזמנות', exact: true }).click();
  await page.getByLabel('חיפוש', { exact: true }).fill(order.order_number);
  await page.getByRole('button', { name: 'חיפוש', exact: true }).click();
  await page.getByRole('link', { name: order.order_number }).click();
  await page.getByRole('button', { name: 'העברה להכנה' }).click();
  await page.getByLabel('חברת משלוח').fill('Israel Post');
  await page.getByLabel('מספר מעקב').fill(`TRACK-${suffix}`);
  await page.getByLabel('קישור מעקב').fill(`https://example.com/track/${suffix}`);
  await page.getByRole('button', { name: 'שמירת המשלוח וסימון כנשלחה' }).click();
  await expect(page.getByRole('link', { name: 'פתיחת מעקב' })).toHaveAttribute('href', `https://example.com/track/${suffix}`);
  await page.getByRole('button', { name: 'סימון כנמסרה' }).click();
  await expect(page.locator('.status-badge')).toHaveText('נמסרה');
  await page.getByLabel('סיבה').fill('Returned unopened');
  await page.getByLabel('מספר הזמנה לאישור').fill(order.order_number);
  await page.getByRole('button', { name: 'סקירת החזר מלא' }).click();
  await page.getByRole('button', { name: 'החזר הזמנה', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(order.order_number);
  await expect(page.getByRole('dialog')).toContainText('281.00');
  const refundResponse = page.waitForResponse((response) => response.url().endsWith(`/orders/${order.id}/refund`));
  await page.getByRole('button', { name: 'אישור: החזר הזמנה' }).click();
  const refund: Schema['RefundRead'] = await (await refundResponse).json();
  await expect(page.getByText(/ההחזר בטיפול/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/ההחזר בטיפול/)).toBeVisible();
  await api(request, token, '/test/payments/webhooks', { event_id: `refund-${suffix}`, event_type: 'refund.succeeded', provider_object_id: refund.provider_refund_id, state: 'confirmed' });
  await page.getByRole('button', { name: 'רענון ההזמנה', exact: true }).click();
  await expect(page.locator('.status-badge')).toHaveText('הוחזרה');
  await expect(page.getByText('ההחזר המלא אושר.')).toBeVisible();

  await api(request, customer, '/cart/items', { sku_id: sku.id, quantity: 1 });
  const unpaid: Schema['CheckoutRead'] = await (await api(request, customer, '/checkout', { address }, 'POST', `cancel-${suffix}`)).json();
  await page.goto(`/orders/${unpaid.order.id}`);
  await page.getByLabel('סיבה').fill('Duplicate order');
  await page.getByLabel('מספר הזמנה לאישור').fill(unpaid.order.order_number);
  await page.getByRole('button', { name: 'סקירת ביטול' }).click();
  await page.getByRole('button', { name: 'ביטול הזמנה', exact: true }).click();
  await page.getByRole('button', { name: 'אישור: ביטול הזמנה' }).click();
  await expect(page.locator('.status-badge')).toHaveText('בוטלה');
  await page.screenshot({ path: test.info().outputPath('commerce.png'), fullPage: true });
  await page.getByRole('button', { name: 'התנתקות' }).click();
});

test('technician cannot open commerce pages or call commerce APIs', async ({ page, request }) => {
  const token = await login(page, '0500000002');
  const id = '00000000-0000-0000-0000-000000000026';
  for (const path of ['/catalog', '/catalog/categories', '/catalog/products/new', `/catalog/products/${id}`, '/catalog/inventory', '/orders', `/orders/${id}`]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'אין הרשאה' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'קטלוג', exact: true })).toHaveCount(0);
  }
  for (const path of ['categories', 'products', `products/${id}`, 'inventory', 'orders', `orders/${id}`]) {
    const response = await request.get(`/api/v1/admin/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(403);
  }
  for (const [method, path] of [['POST', 'categories'], ['PATCH', `categories/${id}`], ['POST', 'products'], ['PATCH', `products/${id}`], ['POST', `products/${id}/skus`], ['PATCH', `skus/${id}`]]) {
    const response = await request.fetch(`/api/v1/admin/${path}`, { method, data: {}, headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(403);
  }
  for (const path of [`inventory/${id}/corrections`, ...['process', 'ship', 'deliver', 'cancel', 'refund'].map((action) => `orders/${id}/${action}`)]) {
    const response = await request.post(`/api/v1/admin/${path}`, { data: {}, headers: { Authorization: `Bearer ${token}` } });
    expect(response.status()).toBe(403);
  }
  await page.getByRole('button', { name: 'התנתקות' }).click();
});
