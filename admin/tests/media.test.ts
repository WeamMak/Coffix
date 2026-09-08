import { expect, it, vi } from 'vitest';
import { createWebClient } from '../src/api/client';

it('uploads local job photos through the API proxy and never sends session credentials to object storage', async () => {
  const fetcher = vi.fn<typeof fetch>(async (url) => String(url).endsWith('/refresh') ? Response.json({ access_token: 'staff-test', user_id: 'tech-1', role: 'technician' }) : new Response(null, { status: 204 }));
  const client = createWebClient({ baseUrl: '/api/v1', fetch: fetcher });
  await client.restore();
  const file = new File(['test photo'], 'photo.jpg', { type: 'image/jpeg' });
  const target = { upload_id: 'upload-1', upload_url: 'http://localhost:8000/api/v1/media/uploads/upload-1/content', method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, expires_at: '2026-09-09T10:00:00Z' };
  await client.uploadFile(target, file);
  expect(fetcher.mock.calls[1][0]).toBe('http://localhost:3000/api/v1/media/uploads/upload-1/content');
  expect(fetcher.mock.calls[1][1]).toMatchObject({ body: file, credentials: 'include', headers: { Authorization: 'Bearer staff-test' } });
  await client.uploadFile({ ...target, upload_url: 'https://private-storage.example/upload-1?signature=test' }, file);
  expect(fetcher.mock.calls[2][1]).toMatchObject({ credentials: 'omit', headers: { 'Content-Type': 'image/jpeg' } });
  expect(new Headers(fetcher.mock.calls[2][1]?.headers).has('Authorization')).toBe(false);
});

it('does not retry an upload after the signed-in account changes', async () => {
  let finishUpload!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('/content')) return new Promise<Response>((resolve) => { finishUpload = resolve; });
    if (String(url).endsWith('/verify')) return Response.json({ access_token: 'new-staff', user_id: 'tech-2', role: 'technician' });
    if (String(url).endsWith('/refresh')) return Response.json({ access_token: 'staff-test', user_id: 'tech-1', role: 'technician' });
    return new Response(null, { status: 204 });
  });
  const client = createWebClient({ baseUrl: '/api/v1', fetch: fetcher });
  await client.restore();
  const uploading = client.uploadFile({ upload_id: 'upload-1', upload_url: 'http://localhost:8000/api/v1/media/uploads/upload-1/content', method: 'PUT', headers: {}, expires_at: '2026-09-09T10:00:00Z' }, new File(['photo'], 'photo.jpg'));
  const result = expect(uploading).rejects.toThrow('Session changed');
  await client.login('0500000002', '123456');
  finishUpload(new Response(null, { status: 401 }));
  await result;
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/content'))).toHaveLength(1);
});
