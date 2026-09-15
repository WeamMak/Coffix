import { expect, test, type Page } from '@playwright/test';

// Every API request is intercepted; these checks create no business data.
const time = '2026-09-15T11:00:00Z';
const person = { id: 'person-31', display_name: 'נועה כהן', phone_e164: '+972501000002', role: 'customer', is_active: true, created_at: time, updated_at: time };
const delivery = { id: 'delivery-31', notification_id: 'message-31', recipient_name: person.display_name, recipient_phone: person.phone_e164, notification_title: 'ההזמנה מוכנה', notification_body: 'ההזמנה CFX-31001 מוכנה. אפשר לעקוב אחר התקדמותה באפליקציה.', related_entity_type: 'order', related_entity_id: 'order-31', related_entity_reference: 'CFX-31001', device_platform: 'android', state: 'retry', attempt_count: 2, last_error_code: 'PUSH_RETRYABLE_FAILURE', updated_at: time, next_attempt_at: '2026-09-15T12:00:00Z', claimed_at: null, dead_lettered_at: null, can_retry: true, retry_unavailable_reason: null };
const audit = { id: 'audit-31', actor_id: 'admin-31', actor_name: 'מנהלת החנות', actor_phone: '+972501000001', action: 'shop.settings_updated', target_type: 'shop_settings', target_id: null, target_label: 'הגדרות החנות', target_reference: null, before: { shipping_fee_agorot: 3000, opening_hours: null }, after: { shipping_fee_agorot: 4000, opening_hours: 'א–ה: 08:00–18:00\nו: 08:00–13:00' }, created_at: time, correlation_id: 'support-31', request_metadata: {}, ip_address: null };

async function install(page: Page, role = 'admin') {
  const commands: { path: string; body: unknown }[] = [];
  const reads: URL[] = [];
  const state = { queued: false, failed: false, empty: false };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/web/refresh') return route.fulfill({ json: { access_token: 'intercepted-fixture', role, user_id: 'admin-31' } });
    if (request.method() !== 'GET') {
      commands.push({ path, body: request.postData() ? request.postDataJSON() : null });
      if (path.endsWith('/retry')) state.queued = true;
      return route.fulfill({ json: path.endsWith('/retry') ? { ...delivery, state: 'pending', can_retry: false } : person });
    }
    reads.push(url);
    if (state.failed) return route.fulfill({ status: 503, json: { code: 'unavailable', title: 'provider payload must stay hidden', correlationId: 'support-failure' } });
    if (path === '/admin/users') return route.fulfill({ json: [person] });
    if (path === '/admin/notification-deliveries') return route.fulfill({ json: state.queued || state.empty ? [] : [delivery, { ...delivery, id: 'inactive', recipient_name: 'עומר לוי', can_retry: false, retry_unavailable_reason: 'device_inactive', last_error_code: 'INVALID_TOKEN', state: 'dead_letter', dead_lettered_at: time }] });
    if (path === '/admin/audit-logs') return route.fulfill({ json: state.empty ? [] : [audit, { ...audit, id: 'unknown', actor_id: null, actor_name: null, actor_phone: null, action: 'future.action', target_type: 'order', target_id: 'deleted-order', target_label: null, before: null, after: { reason: 'מידע שנשמר באירוע' } }] });
    return route.fulfill({ status: 404, json: { code: 'not_found' } });
  });
  return { commands, reads, state };
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.evaluate(() => window.scrollTo(0, 0));
}
for (const width of [1440, 390]) {
  test(`readable people, audit and notification workflows at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 960 });
    const fixture = await install(page);
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/people');
    await page.getByRole('button', { name: 'ניהול נועה כהן' }).click();
    await page.getByRole('combobox', { name: 'תפקיד', exact: true }).selectOption('technician');
    await page.getByRole('button', { name: 'סקירת שינוי הרשאות', exact: true }).click();
    await expect(page.getByRole('region', { name: 'סקירת שינוי הרשאות' })).toContainText('לקוח → טכנאי');
    expect(fixture.commands).toEqual([]);
    await page.getByLabel('חשבון פעיל').uncheck();
    await expect(page.getByRole('button', { name: 'אישור שינוי הרשאות' })).toHaveCount(0);
    await page.getByRole('button', { name: 'סקירת שינוי הרשאות', exact: true }).click();
    await fits(page); await page.screenshot({ path: info.outputPath('people-review.png'), fullPage: true });
    await page.getByRole('button', { name: 'אישור שינוי הרשאות' }).click();
    await expect.poll(() => fixture.commands.length).toBe(1);
    expect(fixture.commands[0]).toEqual({ path: '/admin/users/person-31', body: { role: 'technician', is_active: false } });

    await page.goto('/operations/audit');
    await expect(page.getByRole('cell', { name: /מנהלת החנות/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /שינוי דמי משלוח/ })).toBeVisible();
    const shipping = page.locator('.audit-changes li').filter({ hasText: 'דמי משלוח' });
    await expect(shipping).toContainText('30.00'); await expect(shipping).toContainText('40.00');
    await expect(page.getByText('מערכת', { exact: true })).toBeVisible();
    await expect(page.getByText('הרשומה אינה זמינה או שסוגה אינו נתמך')).toBeVisible();
    await fits(page); await page.screenshot({ path: info.outputPath('audit.png'), fullPage: true });
    await page.getByLabel('אסמכתה או שם רשומה').fill('CFX-31001');
    await page.getByLabel('חיפוש מבצע לפי שם או טלפון').fill('נועה');
    await page.getByRole('button', { name: 'חיפוש מבצע', exact: true }).click();
    await page.getByRole('combobox', { name: 'מבצע הפעולה', exact: true }).selectOption('person-31');
    await page.getByLabel('מתאריך (שעון ישראל)').fill('2026-09-15T09:00');
    await page.getByLabel('עד לתאריך, לא כולל (שעון ישראל)').fill('2026-09-16T09:00');
    await page.getByRole('button', { name: 'סינון יומן הפעילות' }).click();
    await expect.poll(() => fixture.reads.some((url) => url.searchParams.get('from_time') === '2026-09-15T06:00:00.000Z' && url.searchParams.get('actor_id') === 'person-31')).toBe(true);
    await page.getByRole('button', { name: 'ניקוי מסננים' }).click();
    await expect(page.getByLabel('אסמכתה או שם רשומה')).toHaveValue('');

    await page.goto('/operations');
    await expect(page.getByRole('heading', { name: 'בעיות בשליחת התראות', exact: true })).toBeVisible();
    await expect(page.getByText('נועה כהן', { exact: true })).toBeVisible();
    await expect(page.getByText('מתוכננת שליחה חוזרת', { exact: true })).toBeVisible();
    await expect(page.getByText(/המכשיר אינו פעיל לקבלת/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'CFX-31001' }).first()).toHaveAttribute('href', '/orders/order-31');
    await expect(page.locator('.notification-body').first()).toHaveAttribute('dir', 'auto');
    await fits(page); await page.screenshot({ path: info.outputPath('notifications.png'), fullPage: true });
    await page.getByRole('button', { name: 'ניסיון שליחה חוזר', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('נועה כהן · ההזמנה מוכנה');
    await expect(page.getByRole('dialog')).toContainText('אבדה');
    await expect(page.getByRole('button', { name: 'ביטול', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'ניסיון שליחה חוזר', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'ניסיון שליחה חוזר', exact: true }).click();
    await page.getByRole('button', { name: 'אישור: ניסיון שליחה חוזר' }).click();
    await expect(page.getByRole('status')).toContainText('השליחה החוזרת הועברה לתור');
    await expect(page.getByText('אין כרגע בעיות בשליחת התראות.')).toBeVisible();
    expect(fixture.commands.filter((entry) => entry.path.endsWith('/retry'))).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test(`operations load failures, empty results and technical details at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 960 });
    const fixture = await install(page);
    for (const path of ['/operations', '/operations/audit']) {
      fixture.state.failed = true;
      await page.goto(path);
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByText('provider payload must stay hidden')).toHaveCount(0);
      await fits(page);
      fixture.state.failed = false; fixture.state.empty = true;
      await page.getByRole('button', { name: 'טעינה מחדש' }).click();
      await expect(page.getByText(path === '/operations' ? 'אין כרגע בעיות בשליחת התראות.' : 'לא נמצאו אירועים למסננים שנבחרו. אפשר לנקות את המסננים ולהרחיב את החיפוש.')).toBeVisible();
    }
    fixture.state.empty = false;
    await page.reload();
    await page.getByText('פרטים טכניים', { exact: true }).first().click();
    await expect(page.locator('pre').first()).toBeVisible();
    await fits(page); await page.screenshot({ path: info.outputPath('audit-technical.png'), fullPage: true });
    expect(fixture.commands).toEqual([]);
  });
}

test('technicians cannot open people or operations or request their admin read models', async ({ page }) => {
  const fixture = await install(page, 'technician');
  for (const path of ['/people', '/operations', '/operations/audit']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'אין הרשאה' })).toBeVisible();
  }
  expect(fixture.reads).toEqual([]);
  expect(fixture.commands).toEqual([]);
});
