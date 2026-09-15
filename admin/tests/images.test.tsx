import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { category, commercePage, problem } from './commerceSupport';

const png = (name: string) => new File(['png'], name, { type: 'image/png' });

it('creates a category with its selected image and retains the attached upload', async () => {
  const user = userEvent.setup();
  const created = {
    ...category,
    id: 'category-new',
    image_media_id: 'media-1',
    image_url: 'https://storage.test/preview',
    name_he: 'קטגוריה חדשה',
    slug: 'new-category',
  };
  const fetcher = commercePage('/catalog/categories', (url, init) => {
    if (url.pathname.endsWith('/uploads')) return Response.json({ upload_id: 'upload-1', upload_url: 'https://storage.test/photo', method: 'PUT', headers: { 'Content-Type': 'image/png' } });
    if (url.hostname === 'storage.test') return new Response(null, { status: 200 });
    if (url.pathname.endsWith('/complete')) return Response.json({ id: 'media-1' });
    if (url.pathname.endsWith('/download')) return Response.json({ url: 'https://storage.test/preview' });
    if (url.pathname.endsWith('/admin/categories') && init?.method === 'POST') return Response.json(created);
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json([]);
  });

  await user.click(await screen.findByRole('button', { name: 'קטגוריה חדשה' }));
  await user.type(screen.getByLabelText('שם בעברית'), created.name_he);
  await user.type(screen.getByLabelText('מזהה קטגוריה'), created.slug);
  await user.upload(screen.getByLabelText('בחירת תמונה'), png('category.png'));
  expect(await screen.findByRole('img', { name: 'תצוגה מקדימה של התמונה' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'שמירת קטגוריה' }));

  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => (
    String(url).endsWith('/admin/categories')
      && init?.method === 'POST'
      && JSON.parse(String(init.body)).image_media_id === 'media-1'
  ))).toBe(true));
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'קטגוריה חדשה' })).toBeNull());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetcher.mock.calls.some(([url, init]) => (
    String(url).endsWith('/media/media-1') && init?.method === 'DELETE'
  ))).toBe(false);
});

it('creates a machine model with its selected image', async () => {
  const user = userEvent.setup();
  const model = {
    id: 'model-new', manufacturer: 'Coffix', model_name: 'Compact', serial_pattern: null,
    default_warranty_months: 12, image_media_id: 'media-model',
    image_url: 'https://storage.test/model-preview', is_active: true,
    created_at: category.version, updated_at: category.version,
  };
  const fetcher = commercePage('/configuration', (url, init) => {
    if (url.pathname.endsWith('/uploads')) return Response.json({ upload_id: 'upload-model', upload_url: 'https://storage.test/model', method: 'PUT', headers: {} });
    if (url.hostname === 'storage.test') return new Response(null, { status: 200 });
    if (url.pathname.endsWith('/complete')) return Response.json({ id: 'media-model' });
    if (url.pathname.endsWith('/download')) return Response.json({ url: 'https://storage.test/model-preview' });
    if (url.pathname.endsWith('/admin/machine-models') && init?.method === 'POST') return Response.json(model);
    return Response.json([]);
  });

  await user.click(await screen.findByRole('button', { name: 'דגם מכונה חדש' }));
  await user.type(screen.getByLabelText('יצרן'), model.manufacturer);
  await user.type(screen.getByLabelText('שם הדגם'), model.model_name);
  await user.upload(screen.getByLabelText('בחירת תמונה'), png('model.png'));
  expect(await screen.findByRole('img', { name: 'תצוגה מקדימה של התמונה' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'שמירת דגם מכונה' }));

  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => (
    String(url).endsWith('/admin/machine-models')
      && init?.method === 'POST'
      && JSON.parse(String(init.body)).image_media_id === 'media-model'
  ))).toBe(true));
});

it('retains a new product gallery and retries attachment without creating or uploading twice', async () => {
  const { product } = await import('./commerceSupport');
  const user = userEvent.setup();
  let uploadNumber = 0;
  let galleryAttempts = 0;
  const galleryBodies: Array<{ items: Array<{ media_id: string; alt_text_he: string }> }> = [];
  const created = { ...product, id: 'product-new', name_he: 'מוצר מצולם', skus: [] };
  const fetcher = commercePage('/catalog/products/new', (url, init) => {
    if (url.pathname.endsWith('/categories')) return Response.json([category]);
    if (url.pathname.endsWith('/uploads')) {
      uploadNumber += 1;
      return Response.json({ upload_id: `upload-${uploadNumber}`, upload_url: `https://storage.test/upload-${uploadNumber}`, method: 'PUT', headers: {} });
    }
    if (url.hostname === 'storage.test' && url.pathname.startsWith('/upload-')) return new Response(null, { status: 200 });
    if (url.pathname.endsWith('/complete')) return Response.json({ id: `media-${url.pathname.includes('upload-1') ? '1' : '2'}` });
    if (url.pathname.endsWith('/download')) return Response.json({ url: `https://storage.test/preview-${url.pathname.includes('media-1') ? '1' : '2'}` });
    if (url.pathname.endsWith('/admin/products') && init?.method === 'POST') return Response.json(created);
    if (url.pathname.endsWith('/admin/products/product-new') && init?.method === 'PATCH') return Response.json(created);
    if (url.pathname.endsWith('/admin/products/product-new/media') && init?.method === 'PUT') {
      galleryAttempts += 1;
      galleryBodies.push(JSON.parse(String(init.body)));
      return galleryAttempts === 1
        ? problem('internal_error', 'Gallery failed')
        : Response.json({ version: '2026-09-15T12:00:00Z', items: [] });
    }
    if (url.pathname.endsWith('/admin/products/product-new/media')) return Response.json({ version: created.version, items: [] });
    if (url.pathname.endsWith('/admin/products/product-new')) return Response.json(created);
    return Response.json([]);
  });

  await screen.findByRole('option', { name: category.name_he });
  await user.selectOptions(screen.getByLabelText('קטגוריה', { exact: true }), category.id);
  await user.type(screen.getByLabelText('שם בעברית'), created.name_he);
  await user.type(screen.getByLabelText('תיאור בעברית'), 'תיאור מוצר');
  await user.type(screen.getByLabelText('סוג מוצר'), 'beans');
  await user.upload(screen.getByLabelText('בחירת תמונה'), png('first.png'));
  await screen.findByRole('img', { name: 'תצוגה מקדימה של התמונה' });
  await user.upload(screen.getByLabelText('בחירת תמונה'), png('second.png'));
  await waitFor(() => expect(screen.getAllByRole('img', { name: 'תצוגה מקדימה של התמונה' })).toHaveLength(2));
  await user.click(screen.getByRole('button', { name: 'תמונת שער 2' }));
  await user.clear(screen.getByLabelText('תיאור תמונה 1'));
  await user.click(screen.getByRole('button', { name: 'שמירת מוצר' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('המוצר נשמר');
  expect(screen.getAllByRole('img', { name: 'תצוגה מקדימה של התמונה' })).toHaveLength(2);
  expect(fetcher.mock.calls.filter(([url, init]) => String(url).endsWith('/admin/products') && init?.method === 'POST')).toHaveLength(1);
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/uploads'))).toHaveLength(2);

  await user.click(screen.getByRole('button', { name: 'שמירת מוצר' }));
  await waitFor(() => expect(galleryAttempts).toBe(2));
  expect(fetcher.mock.calls.filter(([url, init]) => String(url).endsWith('/admin/products') && init?.method === 'POST')).toHaveLength(1);
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/uploads'))).toHaveLength(2);
  expect(galleryBodies[1]?.items.map(({ media_id }) => media_id)).toEqual(['media-2', 'media-1']);
  expect(galleryBodies[1]?.items[0]?.alt_text_he).toBe(created.name_he);
  expect(await screen.findByRole('heading', { name: 'עריכת מוצר' })).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetcher.mock.calls.filter(([url, init]) => (
    /\/media\/media-[12]$/.test(String(url)) && init?.method === 'DELETE'
  )).map(([url]) => String(url))).toEqual([]);
});

it('uploads a category photo, preserves a failed save and retries without uploading again', async () => {
  const user = userEvent.setup();
  let fail = true;
  const fetcher = commercePage('/catalog/categories', (url, init) => {
    if (url.pathname.endsWith('/uploads')) return Response.json({ upload_id: 'upload-1', upload_url: 'https://storage.test/photo', method: 'PUT', headers: { 'Content-Type': 'image/png' } });
    if (url.hostname === 'storage.test') return new Response(null, { status: 200 });
    if (url.pathname.endsWith('/complete')) return Response.json({ id: 'media-1' });
    if (url.pathname.endsWith('/download')) return Response.json({ url: 'https://storage.test/preview' });
    if (init?.method === 'PATCH') return fail ? problem('record_changed', 'Changed') : Response.json({ ...category, version: 'new-version', image_media_id: 'media-1', image_url: 'https://storage.test/preview' });
    return Response.json([category]);
  });
  await user.click(await screen.findByRole('button', { name: 'עריכת קפה' }));
  await user.upload(screen.getByLabelText('בחירת תמונה'), new File(['photo'], 'photo.png', { type: 'image/png' }));
  expect(await screen.findByRole('img', { name: 'תצוגה מקדימה של התמונה' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'שמירת תמונה' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('הרשומה השתנתה');
  expect(screen.getByRole('img', { name: 'תצוגה מקדימה של התמונה' })).toBeVisible();
  fail = false;
  await user.click(screen.getByRole('button', { name: 'טעינת גרסה עדכנית לתמונה ושמירת הטיוטה' }));
  await user.click(screen.getByRole('button', { name: 'שמירת תמונה' }));
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/uploads'))).toHaveLength(1));
  expect(fetcher.mock.calls.find(([url]) => String(url).includes('storage.test/photo'))?.[1]).toMatchObject({ credentials: 'omit', headers: { 'Content-Type': 'image/png' } });
});

it('orders the gallery and synchronizes metadata version without losing the draft', async () => {
  const { product, sku } = await import('./commerceSupport');
  const user = userEvent.setup();
  const items = ['one', 'two'].map((id, sort_order) => ({ id, media_id: id, url: `https://storage.test/${id}`, alt_text_he: id, sku_id: null, sort_order, media_type: 'image/png' }));
  const fetcher = commercePage('/catalog/products/product-1', (url, init) => {
    if (url.pathname.endsWith('/categories')) return Response.json([category]);
    if (url.pathname.endsWith('/media')) return Response.json({ version: init?.method === 'PUT' ? '2026-09-09T12:00:00.123456Z' : '2026-09-09T11:00:00.123456Z', items });
    return Response.json(product);
  });
  const name = await screen.findByLabelText('שם בעברית');
  await user.clear(name); await user.type(name, 'טיוטה');
  await user.click(await screen.findByRole('button', { name: 'תמונת שער 2' }));
  await user.selectOptions(screen.getByLabelText('מק״ט לתמונה 1'), sku.id);
  await user.click(screen.getByRole('button', { name: 'שמירת גלריה' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true));
  expect(name).toHaveValue('טיוטה');
  await user.click(screen.getByRole('button', { name: 'שמירת מוצר' }));
  await waitFor(() => expect(fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1]?.body).toContain('2026-09-09T12:00:00.123456Z'));
  const body = JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === 'PUT')?.[1]?.body));
  expect(body.version).toBe('2026-09-09T11:00:00.123456Z');
  expect(body.items[0]).toMatchObject({ id: 'two', sku_id: sku.id });
});

it('keeps gallery saving disabled until a replacement upload is complete', async () => {
  const { product } = await import('./commerceSupport');
  const user = userEvent.setup();
  let releaseUpload: (() => void) | undefined;
  const original = { id: 'one', media_id: 'old-media', url: 'https://storage.test/old', alt_text_he: 'ישנה', sku_id: null, sort_order: 0, media_type: 'image/png' };
  const fetcher = commercePage('/catalog/products/product-1', async (url, init) => {
    if (url.pathname.endsWith('/categories')) return Response.json([category]);
    if (url.pathname.endsWith('/uploads')) return Response.json({ upload_id: 'upload-1', upload_url: 'https://storage.test/upload', method: 'PUT', headers: {} });
    if (url.hostname === 'storage.test' && url.pathname === '/upload') {
      await new Promise<void>((resolve) => { releaseUpload = resolve; });
      return new Response(null, { status: 200 });
    }
    if (url.pathname.endsWith('/complete')) return Response.json({ id: 'new-media' });
    if (url.pathname.endsWith('/download')) return Response.json({ url: 'https://storage.test/new' });
    if (url.pathname.endsWith('/media')) {
      if (init?.method === 'PUT') return Response.json({ version: '2026-09-15T10:00:00Z', items: [{ ...original, media_id: 'new-media', url: 'https://storage.test/new' }] });
      return Response.json({ version: product.version, items: [original] });
    }
    return Response.json(product);
  });

  await screen.findByText('תמונות המוצר');
  await user.click(screen.getByText('החלפת תמונה'));
  await user.upload(screen.getAllByLabelText('בחירת תמונה')[0], new File(['png'], 'new.png', { type: 'image/png' }));
  await waitFor(() => expect(releaseUpload).toBeDefined());
  expect(screen.getByRole('button', { name: 'שמירת גלריה' })).toBeDisabled();
  releaseUpload!();
  await waitFor(() => expect(screen.getByRole('button', { name: 'שמירת גלריה' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'שמירת גלריה' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/admin/products/product-1/media') && init?.method === 'PUT')).toBe(true));
  const body = JSON.parse(String(fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/admin/products/product-1/media') && init?.method === 'PUT')?.[1]?.body));
  expect(body.items[0].media_id).toBe('new-media');
});

it('discards a newly uploaded model draft on navigation and confirms removal of the saved image', async () => {
  const user = userEvent.setup();
  const model = { id: 'model-1', manufacturer: 'Coffix', model_name: 'One', image_url: 'https://storage.test/current', image_media_id: 'saved', default_warranty_months: 12, is_active: true };
  const fetcher = commercePage('/configuration', (url, init) => {
    if (url.pathname.endsWith('/uploads')) return Response.json({ upload_id: 'upload-1', upload_url: 'https://storage.test/file', method: 'PUT', headers: {} });
    if (url.hostname === 'storage.test') return new Response(null, { status: 200 });
    if (url.pathname.endsWith('/complete')) return Response.json({ id: 'unattached' });
    if (url.pathname.endsWith('/download')) return Response.json({ url: 'https://storage.test/draft' });
    if (init?.method === 'PATCH') return Response.json({ ...model, image_url: null, image_media_id: null });
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json([model]);
  });
  await user.click(await screen.findByRole('button', { name: 'עריכה One' }));
  await user.click(screen.getByRole('button', { name: 'הסרת תמונה' }));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  await user.click(screen.getByRole('button', { name: 'אישור: הסרת תמונה' }));
  expect(await screen.findByText('לא נבחרה תמונה.')).toBeVisible();
  await user.upload(screen.getByLabelText('בחירת תמונה'), new File(['png'], 'draft.png', { type: 'image/png' }));
  await screen.findByRole('img', { name: 'תצוגה מקדימה של התמונה' });
  await user.click(screen.getByRole('button', { name: 'ביטול השינויים' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/media/unattached') && init?.method === 'DELETE')).toBe(true));
  expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/media/saved') && init?.method === 'DELETE')).toBe(false);
});

it('rejects invalid files and shows transfer progress and retry', async () => {
  const user = userEvent.setup({ applyAccept: false });
  let fail = true;
  let release: (() => void) | undefined;
  const fetcher = commercePage('/catalog/categories', async (url) => {
    if (url.pathname.endsWith('/uploads')) return Response.json({ upload_id: 'upload-1', upload_url: 'https://storage.test/file', method: 'PUT', headers: {} });
    if (url.hostname === 'storage.test') {
      await new Promise<void>((resolve) => { release = resolve; });
      return new Response(null, { status: fail ? 500 : 200 });
    }
    if (url.pathname.endsWith('/complete')) return Response.json({ id: 'retry-media' });
    if (url.pathname.endsWith('/download')) return Response.json({ url: 'https://storage.test/preview' });
    return Response.json([category]);
  });
  await user.click(await screen.findByRole('button', { name: 'עריכת קפה' }));
  await user.upload(screen.getByLabelText('בחירת תמונה'), new File(['bad'], 'bad.svg', { type: 'image/svg+xml' }));
  expect(screen.getByRole('alert')).toHaveTextContent('JPEG או PNG');
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/uploads'))).toBe(false);
  await user.upload(screen.getByLabelText('בחירת תמונה'), new File(['png'], 'image.png', { type: 'image/png' }));
  expect(await screen.findByRole('progressbar')).toBeVisible();
  await waitFor(() => expect(release).toBeDefined());
  release!();
  await user.click(await screen.findByRole('button', { name: 'ניסיון העלאה נוסף' }));
  fail = false;
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => String(url).includes('storage.test/file'))).toHaveLength(2));
  release!();
  expect(await screen.findByRole('img', { name: 'תצוגה מקדימה של התמונה' })).toBeVisible();
});

it('withholds image editors from technicians', async () => {
  commercePage('/catalog/categories', () => Response.json([]), 'technician');
  expect(await screen.findByRole('heading', { name: 'אין הרשאה' })).toBeVisible();
  expect(screen.queryByLabelText('בחירת תמונה')).toBeNull();
});
