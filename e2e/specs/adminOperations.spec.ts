import { expect } from '@playwright/test';
import { api, browserLogin, confirm, login, test } from '../fixtures/users';
import { catalog } from '../fixtures/catalog';
import { checkout } from '../fixtures/commerce';
import { paymentEvent, pushFailure, workers } from '../helpers/fakeProviders';

for (const width of [1440, 390]) {
  test(`People confirmation, readable delivery failure and audit values at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 960 });
    const admin = (await browserLogin(page)).access_token;
    const customer = (await login(request, '0500000003')).access_token;
    const person = await api(request, customer, '/users/me');
    await page.goto('/people');
    await page.getByRole('button', { name: 'ניהול לקוח בדיקה' }).click();
    await page.getByRole('combobox', { name: 'תפקיד', exact: true }).selectOption('technician');
    await page.getByRole('button', { name: 'סקירת שינוי הרשאות', exact: true }).click();
    await expect(page.getByRole('region', { name: 'סקירת שינוי הרשאות' })).toContainText('לקוח → טכנאי');
    expect((await api(request, admin, `/admin/users?q=${encodeURIComponent(person.phone_e164)}`))[0].role).toBe('customer');
    await page.getByLabel('חשבון פעיל').uncheck();
    await expect(page.getByRole('button', { name: 'אישור שינוי הרשאות' })).toHaveCount(0);
    await page.getByRole('button', { name: 'סקירת שינוי הרשאות', exact: true }).click();
    await page.getByRole('button', { name: 'אישור שינוי הרשאות' }).click();
    await expect.poll(async () => (await api(request, admin, `/admin/users?q=${encodeURIComponent(person.phone_e164)}`))[0].is_active).toBe(false);
    const changed = (await api(request, admin, `/admin/users?q=${encodeURIComponent(person.phone_e164)}`))[0];
    expect(changed.role).toBe('technician');
    // A separate customer keeps the delivery scenario independent of deactivation.
    const buyer = (await login(request, '0500000004')).access_token;
    await api(request, buyer, '/users/me', { display_name: 'נועה כהן' }, 'PATCH');
    await api(request, buyer, '/notifications/device-tokens', { token: 'e2e-device', platform: 'android' });
    const { sku } = await catalog(request, admin);
    const order = await checkout(request, buyer, sku.id);
    await paymentEvent(request, order.payment.provider_payment_id, 'operations-paid');
    for (let i = 0; i < 10; i++) await pushFailure(request, 'e2e-device');
    expect((await workers(request)).delivery.retry_count).toBeGreaterThan(0);
    const failures = await api(request, admin, '/admin/notification-deliveries');
    expect(failures[0]).toMatchObject({ recipient_name: 'נועה כהן', related_entity_reference: order.order.order_number, device_platform: 'android', can_retry: true });
    expect(JSON.stringify(failures)).not.toContain('e2e-device');
    await page.goto('/operations');
    await expect(page.getByText('נועה כהן', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('מתוכננת שליחה חוזרת', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: order.order.order_number }).first()).toBeVisible();
    await expect(page.locator('.notification-body').first()).toHaveAttribute('dir', 'auto');
    await page.getByRole('button', { name: 'ניסיון שליחה חוזר', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toContainText('נועה כהן');
    await page.getByRole('button', { name: 'אישור: ניסיון שליחה חוזר' }).click();
    await expect(page.getByRole('status')).toContainText('השליחה החוזרת הועברה לתור');
    const notification = (await api(request, buyer, '/notifications'))[0];
    expect(notification.read_at).toBeNull();
    await api(request, buyer, `/notifications/${notification.id}/read`, undefined, 'POST');
    expect((await api(request, buyer, '/notifications')).find((row: { id: string }) => row.id === notification.id).read_at).toBeTruthy();

    const shop = await api(request, admin, '/admin/shop-settings');
    await api(request, admin, '/admin/shop-settings', { ...shop, shipping_fee_agorot: 4000 }, 'PUT');
    await page.goto('/operations/audit');
    await expect(page.getByRole('cell', { name: 'שינוי דמי משלוח', exact: true })).toBeVisible();
    const shipping = page.locator('.audit-changes li').filter({ hasText: 'דמי משלוח' });
    await expect(shipping).toContainText('30.00');
    await expect(shipping).toContainText('40.00');
    await expect(page.getByRole('cell', { name: /מנהלת בדיקה/ }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const audits = await api(request, admin, '/admin/audit-logs');
    expect(audits.find((entry: { action: string }) => entry.action === 'shop.settings_updated')).toMatchObject({ actor_name: 'מנהלת בדיקה', before: { shipping_fee_agorot: 3000 }, after: { shipping_fee_agorot: 4000 } });
  });
}
