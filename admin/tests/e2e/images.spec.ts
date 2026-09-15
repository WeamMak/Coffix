import { expect, test } from '@playwright/test';
import { confirm } from './staffFixtures';

// The two servers in images.config.ts own a disposable DB and media directory;
// their teardown removes all records/objects even when this test fails.
test.afterEach(async ({ request }) => {
  const sessionsUrl = 'http://127.0.0.1:8299/api/v1/__image_test_sessions';
  await request.post('http://127.0.0.1:8299/api/v1/__image_test_shutdown').catch(() => undefined);
  await expect.poll(async () => {
    try {
      return (await request.get(sessionsUrl)).ok();
    } catch {
      return false;
    }
  }).toBe(false);
});

test('manages model/category/product images and enforces customer/technician permissions', async ({ page, request }) => {
  const sessions = await (await request.get('/api/v1/__image_test_sessions')).json();
  await page.route('**/auth/web/refresh', (route) => route.fulfill({ json: sessions.admin }));
  const api = async (path: string, data?: unknown, method = data === undefined ? 'GET' : 'POST', role = 'admin') => {
    const response = await request.fetch(`/api/v1${path}`, { method, data, headers: { Authorization: `Bearer ${sessions[role].access_token}` } });
    expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
    return response.status() === 204 ? null : response.json();
  };
  const model = await api('/admin/machine-models', { manufacturer: 'Task29', model_name: 'Independent' });
  const category = await api('/admin/categories', { name_he: 'קטגוריית תמונות', slug: 'image-test' });
  const product = await api('/admin/products', { category_id: category.id, name_he: 'מוצר תמונות', description_he: 'מוצר בדיקה', product_type: 'coffee' });
  const sku = await api(`/admin/products/${product.id}/skus`, { sku_code: 'IMAGE-SKU', price_agorot: 1200 });
  const photo = { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1kAAAAASUVORK5CYII=', 'base64') };
  async function singleUpload() {
    await page.getByLabel('בחירת תמונה', { exact: true }).setInputFiles(photo);
    await expect(page.getByRole('img', { name: 'תצוגה מקדימה של התמונה' })).toBeVisible();
    const saved = page.waitForResponse((response) => response.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'שמירת תמונה', exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await expect(page.getByText('התמונה נשמרה.', { exact: true })).toBeVisible();
  }
  await page.goto('/configuration');
  await page.getByRole('button', { name: 'עריכה Independent' }).click();
  await singleUpload();
  let models = await api('/machines/models', undefined, 'GET', 'customer');
  const firstModelUrl = models[0].image_url;
  expect(firstModelUrl).toBeTruthy();
  await singleUpload();
  models = await api('/machines/models', undefined, 'GET', 'customer');
  expect(models[0].image_url).not.toBe(firstModelUrl);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/images-model.png', fullPage: true });
  await confirm(page, 'הסרת תמונה');
  expect((await api('/machines/models', undefined, 'GET', 'customer'))[0].image_url).toBeNull();

  await page.goto('/catalog/categories');
  await page.getByRole('button', { name: 'עריכת קטגוריית תמונות' }).click();
  await singleUpload();
  const before = (await api('/catalog/categories', undefined, 'GET', 'customer'))[0].image_url;
  await singleUpload();
  expect((await api('/catalog/categories', undefined, 'GET', 'customer'))[0].image_url).not.toBe(before);
  await page.getByRole('combobox', { name: 'סמל קטגוריה' }).selectOption('capsule');
  const categorySaved = page.waitForResponse((response) => response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'שמירת קטגוריה', exact: true }).click();
  expect((await categorySaved).ok()).toBe(true);
  expect((await api('/catalog/categories', undefined, 'GET', 'customer'))[0].icon_key).toBe('capsule');
  await page.getByRole('button', { name: 'עריכת קטגוריית תמונות' }).click();
  await confirm(page, 'הסרת תמונה');
  expect((await api('/catalog/categories', undefined, 'GET', 'customer'))[0].image_url).toBeNull();

  await page.goto(`/catalog/products/${product.id}`);
  for (let index = 0; index < 2; index++) {
    await page.getByLabel('בחירת תמונה', { exact: true }).last().setInputFiles(photo);
    await expect(page.locator('.gallery-item')).toHaveCount(index + 1);
  }
  await page.getByLabel('תיאור תמונה 1').fill('ראשונה');
  await page.getByLabel('תיאור תמונה 2').fill('שנייה');
  await page.getByRole('button', { name: 'תמונת שער 2', exact: true }).click();
  await page.getByLabel('מק״ט לתמונה 1').selectOption(sku.id);
  await page.getByRole('button', { name: 'שמירת גלריה', exact: true }).click();
  await expect(page.getByText('הגלריה נשמרה.', { exact: true })).toBeVisible();
  let gallery = (await api(`/catalog/products/${product.id}`, undefined, 'GET', 'customer')).media;
  expect(gallery.map((item: { alt_text_he: string }) => item.alt_text_he)).toEqual(['שנייה', 'ראשונה']);
  expect(gallery[0].sku_id).toBe(sku.id);
  const firstMedia = gallery[0].media_id;
  await page.locator('.gallery-item').first().getByText('החלפת תמונה', { exact: true }).click();
  await page.locator('.gallery-item').first().getByLabel('בחירת תמונה').setInputFiles(photo);
  const gallerySave = page.getByRole('button', { name: 'שמירת גלריה', exact: true });
  await expect(gallerySave).toBeDisabled();
  await expect(gallerySave).toBeEnabled();
  const gallerySaved = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith(`/admin/products/${product.id}/media`));
  await page.getByRole('button', { name: 'שמירת גלריה', exact: true }).click();
  const replacement = await (await gallerySaved).json();
  expect(replacement.items[0].media_id).not.toBe(firstMedia);
  await expect.poll(async () => (await api(`/catalog/products/${product.id}`, undefined, 'GET', 'customer')).media[0].media_id).not.toBe(firstMedia);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/images-gallery-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/images-gallery-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await confirm(page, 'הסרת תמונה 1');
  await page.getByRole('button', { name: 'שמירת גלריה', exact: true }).click();
  await expect.poll(async () => (await api(`/catalog/products/${product.id}`, undefined, 'GET', 'customer')).media.length).toBe(1);
  gallery = (await api(`/catalog/products/${product.id}`, undefined, 'GET', 'customer')).media;
  expect(gallery[0].alt_text_he).toBe('ראשונה');
  for (const role of ['customer', 'technician']) {
    const response = await request.post('/api/v1/media/uploads', { headers: { Authorization: `Bearer ${sessions[role].access_token}` }, data: { purpose: 'product', content_type: 'image/png', size_bytes: photo.buffer.length } });
    expect(response.status()).toBe(403);
    expect((await request.get(`/api/v1/admin/products/${product.id}/media`, { headers: { Authorization: `Bearer ${sessions[role].access_token}` } })).status()).toBe(403);
  }
  const audits = await api('/admin/audit-logs?limit=100');
  expect(audits.some((item: { action: string }) => item.action === 'catalog.product_images_updated')).toBe(true);
  expect(model.id).toBeTruthy();
});
