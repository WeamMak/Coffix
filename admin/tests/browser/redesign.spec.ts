import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { service as baseService, staffUser } from '../serviceSupport';

// All requests in this file are intercepted. No local business records are used.
const version = '2026-09-09T10:00:00.123456Z';
const category = { id: 'cat-28', name_he: 'מכונות קפה', slug: 'coffee-machines', image_key: null, icon_key: 'coffee', sort_order: 0, is_active: true, version };
const sku = { id: 'sku-28', sku_code: 'CFX-ESP-200-BLK', attributes: { color: 'Black' }, price_agorot: 269000, currency: 'ILS', stock_quantity: 14, is_active: true, machine_model_id: 'model-1', version };
const product = { id: 'product-28', category_id: category.id, name_he: 'מכונת אספרסו ביתית פרו 2', description_he: 'מכונת אספרסו ידנית עם מקציף חלב מקצועי.', admin_label_en: 'Coffix Pro 2', product_type: 'coffee_machine', is_featured: true, is_active: true, skus: [sku], version, created_at: version, updated_at: version };
const order = { id: 'order-28', order_number: 'CFX-10482', state: 'paid', total_agorot: 272000, subtotal_agorot: 269000, shipping_agorot: 3000, currency: 'ILS', created_at: version, updated_at: version, payment_deadline: version, items: [{ id: 'item-28', sku_id: sku.id, product_id: product.id, product_name_he: product.name_he, sku_code: sku.sku_code, attributes: sku.attributes, unit_price_agorot: sku.price_agorot, quantity: 1, line_total_agorot: sku.price_agorot, currency: 'ILS', machine_model_id: 'model-1' }], address: { recipient_name: 'נועה ברקוביץ׳', phone_e164: '+972525550113', street: 'דיזנגוף', building: '41', apartment: '8', city: 'תל אביב', postal_code: null, country: 'IL' }, history: [{ from_state: 'pending_payment', to_state: 'paid', source: 'provider', reason: null, created_at: version }], shipment: null, allowed_actions: ['process', 'refund'], refund: null };
const model = { id: 'model-1', manufacturer: 'Coffix', model_name: 'Classic', serial_pattern: '^CF[0-9]+$', default_warranty_months: 12, is_active: true, created_at: version, updated_at: version };
const serviceType = { id: 'type-1', label_he: 'תיקון מכונת קפה', label_en: 'Coffee machine repair', icon_key: 'tool', tags_he: ['בדיקה', 'תיקון'], diagnostic_fee_agorot: 12000, is_active: true, version: 3, machine_model_ids: ['model-1'] };
const intake = { version: 5, urgencies: [{ id: 'normal', name_he: 'רגיל', description_he: 'טיפול רגיל בשעות הפעילות', surcharge_percent: 0 }, { id: 'urgent', name_he: 'דחוף', description_he: 'טיפול בעדיפות גבוהה', surcharge_percent: 25 }], weekdays: [0, 1, 2, 3, 6], slots: [{ start: '09:00', end: '11:00' }, { start: '11:00', end: '13:00' }], horizon_days: 14, response_hours: 4 };

async function install(page: Page, options: { role?: 'admin' | 'technician'; empty?: boolean } = {}) {
  const role = options.role ?? 'admin';
  const service = { ...baseService, description: 'המכונה מפסיקה לחמם אחרי כוס אחת. נשמע רעש מהמשאבה בזמן ההכנה.', customer: { ...baseService.customer, display_name: 'רותם חדד' }, address_snapshot: { street: 'סוקולוב', building: '12', city: 'הרצליה', country: 'IL' } };
  const list = <T,>(items: T[]) => options.empty ? [] : items;
  const bodies: Record<string, unknown> = {
    '/admin/dashboard': { product_revenue_agorot: 4832000, open_services: 12, awaiting_payment_orders: 7, awaiting_payment_services: 3, users_by_role: { technician: 2 }, orders_by_state: { paid: 7, processing: 4, shipped: 9 }, service_requests_by_state: { diagnosing: 3, awaiting_diagnostic_payment: 3, scheduled: 6 }, failed_deliveries: 4, failed_outbox_events: 0, pending_outbox_events: 2, low_stock_skus: 5, todays_appointments: list([{ id: service.id, reference: service.reference, technician_name: 'עומר גל', start: version, end: '2026-09-09T12:00:00Z' }]) },
    '/admin/categories': list([category]), '/admin/products': { items: list([product]), total: options.empty ? 0 : 1 },
    '/admin/products/product-28': product, '/admin/products/product-28/media': { product_id: product.id, version, images: [] },
    '/admin/inventory': list([{ id: sku.id, sku_code: sku.sku_code, product_name_he: product.name_he, stock_quantity: 14, reserved_quantity: 2, available_quantity: 12, is_active: true }]),
    '/admin/orders': list([order]), '/admin/orders/order-28': order,
    '/admin/service-requests': list([service]), '/admin/service-requests/service-1': service,
    '/technician/jobs': list([service]), '/technician/jobs/service-1': { ...service, state: 'received', allowed_actions: ['start_diagnosis'] },
    '/admin/machine-models': list([model]), '/admin/service-types': list([serviceType]),
    '/admin/service-intake-settings': intake,
    '/admin/shop-settings': { version: 1, phone: '+97231234567', whatsapp: null, email: null, opening_hours: null, shop_address: { street: 'הארבעה', building: '17', city: 'תל אביב', country: 'IL' }, shipping_fee_agorot: 3000 },
    '/admin/configuration': { shop_address: { street: 'הארבעה', building: '17', city: 'תל אביב', country: 'IL' }, shipping_fee_agorot: 3000 },
    '/admin/users': list([{ ...staffUser, display_name: 'עומר גל' }]), '/admin/technicians': list([{ ...staffUser, display_name: 'עומר גל' }]),
    '/admin/notification-deliveries': list([{ id: 'delivery-28', notification_id: 'notification-28', recipient_name: 'נועה כהן', notification_title: 'ההזמנה מוכנה', notification_body: 'אפשר לעקוב אחר ההזמנה באפליקציה.', device_platform: 'android', updated_at: version, claimed_at: null, retry_unavailable_reason: null, state: 'dead_letter', attempt_count: 3, last_error_code: 'TEMPORARY', next_attempt_at: version, dead_lettered_at: version, can_retry: true }]),
    '/admin/audit-logs': list([{ id: 'audit-28', action: 'inventory.stock_corrected', actor_id: 'staff-28', target_type: 'sku', target_id: sku.id, before: { stock_quantity: 12 }, after: { stock_quantity: 14 }, correlation_id: 'req-28-ABC', created_at: version }]),
  };
  const commands: { path: string; body: unknown }[] = [];
  const unhandled: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/web/refresh') return route.fulfill({ json: { access_token: 'visual-fixture', user_id: 'staff-28', role } });
    if (route.request().method() !== 'GET') {
      commands.push({ path, body: route.request().postDataJSON() });
      return route.fulfill({ status: 409, json: { code: 'record_changed', title: 'English backend failure must stay hidden', correlationId: 'req-28-ABC' } });
    }
    if (path in bodies) return route.fulfill({ json: bodies[path] });
    unhandled.push(path);
    return route.fulfill({ status: 404, json: { code: 'not_found' } });
  });
  return { commands, unhandled, bodies };
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} must fit the viewport`).toBe(true);
  const misaligned = await page.locator('.cell-value, .form-field label, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, textarea').evaluateAll((elements) => elements.filter((element) => {
    if (!element.getClientRects().length) return false;
    const { textAlign, direction } = getComputedStyle(element);
    return textAlign !== 'right' && !(textAlign === 'start' && direction === 'rtl') && !(textAlign === 'end' && direction === 'ltr');
  }).map((element) => element.getAttribute('aria-label') ?? element.getAttribute('name') ?? element.textContent?.trim().slice(0, 60) ?? element.tagName));
  expect(misaligned, `${name}: field labels and values must align to the right regardless of reading direction`).toEqual([]);
  // Modal backdrops belong to the viewport, including when their trigger is far down a page.
  const modal = await page.locator('dialog[open]').count() > 0;
  if (!modal) await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: !modal });
}

const screens = [
  ['/overview', 'סקירה כללית'], ['/catalog', 'קטלוג'], ['/catalog/categories', 'קטגוריות'],
  ['/catalog/inventory', 'מלאי'], ['/catalog/products/new', 'מוצר חדש'], ['/catalog/products/product-28', 'עריכת מוצר'],
  ['/orders', 'הזמנות'], ['/orders/order-28', 'CFX-10482'], ['/service', 'בקשות שירות'], ['/service/service-1', 'SVC-27001'],
  ['/configuration', 'דגמי מכונות'], ['/configuration/service-types', 'סוגי שירות'], ['/configuration/intake', 'הגדרות קבלת שירות'],
  ['/configuration/shop', 'הגדרות החנות'], ['/people', 'אנשים והרשאות'], ['/operations', 'בעיות בשליחת התראות'], ['/operations/audit', 'יומן פעילות'],
] as const;

for (const width of [1440, 390]) {
test(`session restoration and missing route at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  await install(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/auth/web/refresh', async (route) => {
    await pending;
    await route.fulfill({ json: { access_token: 'visual-fixture', user_id: 'staff-28', role: 'admin' } });
  });
  await page.goto('/overview');
  await expect(page.getByRole('status')).toHaveText('משחזרים את החיבור…');
  await capture(page, info, 'session-restoration');
  release();
  await expect(page.getByRole('heading', { name: 'סקירה כללית' })).toBeVisible();
  await page.goto('/missing-page');
  await expect(page.getByRole('heading', { name: 'העמוד לא נמצא' })).toBeVisible();
  await capture(page, info, 'not-found');
});
  test(`all administrator routes in Hebrew at ${width}px`, async ({ page }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const fixture = await install(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [path, title] of screens) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: /טוענים/ })).toHaveCount(0);
      await capture(page, info, path.slice(1).replaceAll('/', '-'));
    }
    expect(fixture.unhandled).toEqual([]);
    expect(fixture.commands).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`technician access, assigned cards and job detail at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const fixture = await install(page, { role: 'technician' });
    await page.goto('/jobs');
    await expect(page.getByRole('heading', { name: 'העבודות שלי' })).toBeVisible();
    await capture(page, info, 'jobs');
    await page.getByRole('link', { name: 'SVC-27001' }).click();
    await expect(page.getByRole('button', { name: 'התחלת אבחון', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'הערה', exact: true })).toBeVisible();
    await expect(page.getByLabel('למי ההערה גלויה')).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveAttribute('dir', 'ltr');
    await capture(page, info, 'job-detail');
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'אין הרשאה' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'הזמנות', exact: true })).toHaveCount(0);
    await capture(page, info, 'permission-denied');
    expect(fixture.unhandled).toEqual([]);
  });
}

test('phone drawer supports keyboard navigation, Escape and focus return', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page);
  await page.goto('/overview');
  const trigger = page.getByRole('button', { name: 'פתיחת תפריט' });
  await trigger.focus(); await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'תפריט ניווט' });
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())?.x).toBeGreaterThan(0);
  await expect(drawer.getByRole('button', { name: 'סגירת תפריט' })).toBeFocused();
  await capture(page, info, 'drawer');
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible(); await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole('link', { name: 'קטלוג', exact: true }).click();
  await expect(page).toHaveURL('/catalog');
  await expect(drawer).not.toBeVisible();
});

for (const width of [1440, 390]) {
test(`Hebrew document, OTP validation and safe backend error preserve the phone at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill(path.endsWith('/refresh') ? { status: 401, json: { code: 'unauthorized' } }
      : path.endsWith('/request') ? { json: { message: 'Code sent' } }
      : { status: 403, json: { code: 'staff_required', title: 'Hidden English provider error', correlationId: 'req-28-ABC' } });
  });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const phone = page.getByRole('textbox', { name: 'מספר טלפון' });
  await expect(phone).toHaveAttribute('dir', 'ltr');
  await page.getByRole('button', { name: 'שליחת קוד' }).click();
  expect(await phone.evaluate((input: HTMLInputElement) => input.validationMessage)).toBe('יש למלא את השדה.');
  await capture(page, info, 'login');
  await phone.fill('0501234567');
  await page.getByRole('button', { name: 'שליחת קוד' }).click();
  const code = page.getByRole('textbox', { name: 'קוד אימות' });
  await expect(code).toHaveAttribute('dir', 'ltr');
  await code.fill('123456'); await capture(page, info, 'otp');
  await page.getByRole('button', { name: 'כניסה', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('הכניסה מיועדת למנהלים ולטכנאים בלבד.');
  await expect(page.getByRole('alert')).not.toContainText('Hidden English');
  await expect(phone).toHaveValue('0501234567');
  await capture(page, info, 'login-error');
});

test(`stale category drafts, native icon dropdown and mixed-direction SKU stay usable at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  const fixture = await install(page);
  await page.goto('/catalog/categories');
  await page.getByRole('button', { name: 'עריכת מכונות קפה' }).click();
  await page.getByRole('combobox', { name: 'סמל קטגוריה' }).selectOption('capsule');
  await expect(page.getByRole('img', { name: 'תצוגה מקדימה: קפסולות' })).toBeVisible();
  await page.getByLabel('מזהה קטגוריה').fill('coffee-machines-new');
  await capture(page, info, 'category-icon-editor');
  await page.getByRole('button', { name: 'שמירת קטגוריה' }).click();
  await expect(page.getByRole('alert')).toContainText('הרשומה השתנתה');
  await expect(page.getByLabel('מזהה קטגוריה')).toHaveValue('coffee-machines-new');
  expect(fixture.commands).toEqual([{ path: '/admin/categories/cat-28', body: { name_he: category.name_he, slug: 'coffee-machines-new', image_key: null, icon_key: 'capsule', sort_order: 0, is_active: true, version } }]);
  await capture(page, info, 'stale-draft');
  await page.goto('/catalog/products/product-28');
  await expect(page.getByText(sku.sku_code, { exact: true })).toHaveAttribute('dir', 'ltr');
  await page.getByLabel('תווית באנגלית').fill('Preserved English draft');
  await page.getByRole('button', { name: 'שמירת מוצר' }).click();
  await expect(page.getByRole('alert')).toContainText('הרשומה השתנתה');
  await expect(page.getByLabel('תווית באנגלית')).toHaveValue('Preserved English draft');
  await capture(page, info, 'product-failed-draft');
});

test(`refund confirmation contains record, amount, focus and busy/failed states at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  const fixture = await install(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let sent = 0;
  await page.route('**/admin/orders/order-28/refund', async (route) => {
    sent += 1; await pending;
    await route.fulfill({ status: 503, json: { code: 'provider_unavailable', title: 'Do not show provider stack', correlationId: 'refund-28' } });
  });
  await page.goto('/orders/order-28');
  await page.getByLabel('סיבה', { exact: true }).fill('החזרת הזמנה לבקשת הלקוח');
  await page.getByLabel('מספר הזמנה לאישור').fill(order.order_number);
  await page.getByRole('button', { name: 'סקירת החזר מלא' }).click();
  const trigger = page.getByRole('button', { name: 'החזר הזמנה', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('CFX-10482'); await expect(dialog).toContainText('2,720.00');
  await expect(dialog.getByRole('button', { name: 'ביטול', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'אישור: החזר הזמנה' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'ביטול', exact: true })).toBeFocused();
  await capture(page, info, 'refund-confirmation');
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await trigger.click(); await dialog.getByRole('button', { name: 'אישור: החזר הזמנה' }).click();
  await expect(dialog.getByRole('button', { name: 'מבצעים…' })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  await capture(page, info, 'refund-busy');
  release();
  await expect(dialog.getByRole('alert')).toContainText('לא ניתן להשלים את הפעולה. נסו שוב.');
  await expect(dialog.getByRole('alert')).not.toContainText('provider stack');
  await capture(page, info, 'refund-failed');
  expect(sent).toBe(1); expect(fixture.commands).toEqual([]);
});

test(`empty, loading, safe failure and service payment-wait states at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  const fixture = await install(page, { empty: true });
  await page.goto('/catalog');
  await expect(page.getByRole('cell', { name: 'לא נמצאו רשומות.' })).toBeVisible();
  await capture(page, info, 'empty-catalog');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/admin/orders?**', async (route) => {
    await pending;
    await route.fulfill({ status: 400, json: { code: 'unexpected_provider_error', title: 'Private English output', correlationId: 'req-load-28' } });
  });
  await page.goto('/orders');
  await expect(page.getByRole('status')).toContainText('טוענים');
  await capture(page, info, 'loading-orders'); release();
  await expect(page.getByRole('alert')).toContainText('לא ניתן להשלים את הפעולה. נסו שוב.');
  await capture(page, info, 'failed-orders');
  for (const state of ['awaiting_diagnostic_payment', 'awaiting_additional_payment']) {
    fixture.bodies['/admin/service-requests/service-1'] = { ...baseService, state, allowed_actions: [], diagnostic_base_fee_agorot: 12000, diagnostic_fee_agorot: 15600 };
    await page.goto('/service/service-1');
    await expect(page.locator('.outcome')).toBeVisible();
    await expect(page.getByRole('button', { name: 'סקירת תיאום' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'התחלת תיקון ללא עלות נוספת' })).toHaveCount(0);
    await capture(page, info, state);
  }
});

test(`metadata editors, stock review and access confirmation at ${width}px`, async ({ page }, info) => {
  const fixture = await install(page);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  await page.goto('/configuration');
  await page.getByRole('button', { name: 'עריכה Classic' }).click();
  await expect(page.getByLabel('תבנית מספר סידורי')).toHaveAttribute('dir', 'ltr');
  await capture(page, info, 'machine-editor');
  await page.goto('/configuration/service-types');
  await page.getByRole('button', { name: `עריכה ${serviceType.label_he}` }).click();
  await page.getByLabel('סמל שירות').selectOption('coffee');
  await expect(page.getByRole('img', { name: 'תצוגה מקדימה: קפה' })).toBeVisible();
  await expect(page.getByLabel('Coffix Classic', { exact: true })).toBeChecked();
  await capture(page, info, 'service-type-editor');
  await page.getByRole('button', { name: 'סקירת סוג השירות' }).click();
  await page.getByRole('button', { name: 'שמירת סוג שירות', exact: true }).click();
  await capture(page, info, 'service-type-confirmation');
  await page.getByRole('button', { name: 'אישור: שמירת סוג שירות' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('הרשומה השתנתה');
  await capture(page, info, 'service-type-failed');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Coffix Classic', { exact: true })).toBeChecked();
  expect(fixture.commands[0]).toEqual({ path: '/admin/service-types/type-1', body: {
    label_he: serviceType.label_he, label_en: serviceType.label_en, icon_key: 'coffee',
    tags_he: serviceType.tags_he, diagnostic_fee_agorot: serviceType.diagnostic_fee_agorot,
    is_active: true, machine_model_ids: ['model-1'], expected_version: serviceType.version,
  } });
  await page.goto('/catalog/products/product-28');
  await page.getByRole('button', { name: `עריכת ${sku.sku_code}` }).click();
  await expect(page.getByLabel('מאפיינים (JSON)')).toHaveAttribute('dir', 'ltr');
  await capture(page, info, 'sku-editor');
  await page.goto('/catalog/inventory');
  await page.getByRole('button', { name: `עדכון ${sku.sku_code}` }).click();
  await page.getByLabel('כמות כוללת חדשה').fill('12');
  await page.getByLabel('סיבה', { exact: true }).fill('ספירה ידנית במחסן');
  await capture(page, info, 'stock-editor');
  await page.getByRole('button', { name: 'סקירת עדכון המלאי' }).click();
  await page.getByRole('button', { name: 'החלת עדכון מלאי', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(sku.sku_code);
  await capture(page, info, 'stock-confirmation');
  await page.keyboard.press('Escape');
  await page.goto('/people');
  await page.getByRole('button', { name: 'ניהול עומר גל' }).click();
  await page.getByRole('combobox', { name: 'תפקיד', exact: true }).selectOption('admin');
  await page.getByRole('button', { name: 'סקירת שינוי הרשאות' }).click();
  await expect(page.getByRole('region', { name: 'סקירת שינוי הרשאות' })).toContainText('טכנאי → מנהל');
  await capture(page, info, 'access-confirmation');
});

test(`schedule overlap review and notification queued outcome at ${width}px`, async ({ page }, info) => {
  const fixture = await install(page);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  fixture.bodies['/admin/service-requests/service-1'] = { ...baseService, state: 'awaiting_admin_review', allowed_actions: ['schedule'], diagnostic_fee_agorot: 12000 };
  await page.route('**/service-requests/service-1/appointment-preview', (route) => route.fulfill({ json: [{ request_id: 'other-job', reference: 'SVC-27002', start: version, end: '2026-09-09T12:00:00Z' }] }));
  await page.goto('/service/service-1');
  await page.getByRole('combobox', { name: 'טכנאי', exact: true }).selectOption(staffUser.id);
  await page.getByLabel('תחילת התיאום (שעון ישראל)').fill('2026-09-10T10:00');
  await page.getByLabel('סיום התיאום (שעון ישראל)').fill('2026-09-10T11:00');
  await capture(page, info, 'appointment-editor');
  await page.getByRole('button', { name: 'סקירת תיאום' }).click();
  await expect(page.getByRole('heading', { name: 'חפיפות בתיאום' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'אישור תיאום', exact: true })).toHaveCount(0);
  await capture(page, info, 'appointment-overlap');
  await page.getByLabel('המשך למרות החפיפות בתיאום').check();
  await page.getByRole('button', { name: 'אישור תיאום', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('החפיפות בתיאום נבדקו ואושרו');
  await capture(page, info, 'appointment-confirmation');
  await page.keyboard.press('Escape');
  await page.route('**/notification-deliveries/delivery-28/retry', (route) => route.fulfill({ json: { id: 'delivery-28' } }));
  await page.goto('/operations');
  await page.getByRole('button', { name: 'ניסיון שליחה חוזר', exact: true }).click();
  await capture(page, info, 'notification-confirmation');
  await page.getByRole('button', { name: 'אישור: ניסיון שליחה חוזר' }).click();
  await expect(page.getByRole('status')).toContainText('השליחה החוזרת הועברה לתור');
  await capture(page, info, 'notification-queued');
  expect(fixture.commands).toEqual([]);
});

}
