import { expect } from '@playwright/test';
import { actors, api, call, refresh, test } from '../fixtures/users';
import { advance } from '../helpers/clock';

test('media rejects oversized metadata, disguised bytes, cross-owner access and expired uploads', async ({ request }) => {
  const a = await actors(request);
  const body = { purpose: 'machine_registration', content_type: 'image/jpeg', size_bytes: 12 };
  const oversized = await call(request, a.customer, '/media/uploads', { ...body, size_bytes: 10485761 });
  expect(oversized.status()).toBe(422);
  expect((await oversized.json()).code).toBe('MEDIA_TOO_LARGE');
  const unsupported = await call(request, a.customer, '/media/uploads', { ...body, content_type: 'text/html' });
  expect(unsupported.status()).toBe(422);
  const upload = await api(request, a.customer, '/media/uploads', body);
  expect((await call(request, a.other, `/media/uploads/${upload.upload_id}/complete`, {})).status()).toBe(404);
  const bytes = Buffer.from('<html></html');
  expect((await request.put(upload.upload_url, { data: bytes, headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${a.customer}` } })).status()).toBe(204);
  const rejected = await call(request, a.customer, `/media/uploads/${upload.upload_id}/complete`, {});
  expect(rejected.status()).toBe(422);
  expect((await rejected.json()).code).toBe('MEDIA_SIGNATURE_MISMATCH');
  const expired = await api(request, a.customer, '/media/uploads', body);
  await advance(request, 901);
  const customer = await refresh(request, a.sessions.customer);
  expect((await request.put(expired.upload_url, { data: bytes, headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${customer.access_token}` } })).status()).toBe(410);
});
