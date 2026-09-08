import { expect, test } from '@playwright/test';

// Run only against the seeded local API with fake OTP (see admin/README.md).
for (const staff of [
  { role: 'admin', phone: '0500000001', heading: 'Overview' },
  { role: 'technician', phone: '0500000002', heading: 'My jobs' },
]) {
  test(`${staff.role} can sign in, reload and sign out`, async ({ page, context }) => {
    if (staff.role === 'technician') await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByLabel('Phone number').fill(staff.phone);
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByLabel('Verification code').fill('123456');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: staff.heading, exact: true })).toBeVisible();
    const cookie = (await context.cookies()).find((item) => item.name === 'coffix_web_refresh');
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Strict', path: '/api/v1/auth/web' });
    expect(await page.evaluate(() => document.cookie)).not.toContain('coffix_web_refresh');
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: staff.heading, exact: true })).toBeVisible();
    const otherTab = await context.newPage();
    await Promise.all([page.reload(), otherTab.goto('/')]);
    await expect(page.getByRole('heading', { name: staff.heading, exact: true })).toBeVisible();
    await expect(otherTab.getByRole('heading', { name: staff.heading, exact: true })).toBeVisible();
    await otherTab.close();
    if (staff.role === 'technician') {
      await expect(page.getByRole('link', { name: 'Orders' })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.goto('/orders');
      await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
    }
    await page.screenshot({ path: test.info().outputPath(`${staff.role}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
    expect((await context.cookies()).find((item) => item.name === 'coffix_web_refresh')).toBeUndefined();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  });
}
