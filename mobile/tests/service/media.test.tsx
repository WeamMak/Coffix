import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { MediaGrid } from '../../src/components/MediaGrid';
import type { DraftMedia } from '../../src/features/service/intakeStore';
import { renderService, response } from './helpers';

jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { JPEG: 'jpeg' } }));
const uploadAsync = jest.fn();
const cancel = jest.fn();
let size = 100;
function MediaHarness({ initial = [] }: { initial?: DraftMedia[] }) {
  const [items, setItems] = useState(initial);
  return <MediaGrid items={items} scope="s" collectionId="collection-1" onChange={async value => { setItems(value); }} />;
}
beforeEach(() => {
  jest.clearAllMocks(); size = 100;
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({ granted: true } as never);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///clip.mp4', mimeType: 'video/mp4' }] } as never);
  jest.mocked(File).mockImplementation(() => ({ size, createUploadTask: jest.fn((_url, options) => {
    options.onProgress?.({ bytesSent: 50, totalBytes: 100 });
    return { uploadAsync, cancel };
  }) }) as never);
  uploadAsync.mockResolvedValue({ status: 200 });
  globalThis.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') return response(null, 204);
    return response(String(url).endsWith('/complete') ? { id: 'media-1' } : {
      upload_id: 'upload-1', upload_url: 'https://storage.example/upload', headers: {}, method: 'PUT',
    }, 201);
  });
});
it('uploads service media with the draft collection and allows removal before submission', async () => {
  await renderService(<MediaHarness />);
  await fireEvent.press(screen.getByRole('button', { name: 'בחירת וידאו' }));
  expect(await screen.findByRole('button', { name: 'פתיחת קובץ 1' })).toBeOnTheScreen();
  expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/media\/uploads$/), expect.objectContaining({ body: JSON.stringify({ collection_id: 'collection-1', content_type: 'video/mp4', purpose: 'service_issue', size_bytes: 100 }), method: 'POST' }));
  await fireEvent.press(screen.getByRole('button', { name: 'הסרת קובץ 1' }));
  expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/media\/media-1$/), expect.objectContaining({ method: 'DELETE' }));
});
it('shows progress and retries a failed upload before accepting a completed attachment', async () => {
  let rejectUpload: (reason: Error) => void = () => {};
  uploadAsync.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectUpload = reject; }));
  await renderService(<MediaHarness />);
  await fireEvent.press(screen.getByRole('button', { name: 'בחירת וידאו' }));
  expect(await screen.findByText('מעלים קובץ 50%')).toBeOnTheScreen();
  rejectUpload(new Error('offline'));
  await fireEvent.press(await screen.findByRole('button', { name: 'ניסיון העלאה נוסף' }));
  expect(await screen.findByRole('button', { name: 'פתיחת קובץ 1' })).toBeOnTheScreen();
});
it('rejects oversized video before sending it to storage', async () => {
  size = 104857601;
  await renderService(<MediaHarness />);
  await fireEvent.press(screen.getByRole('button', { name: 'בחירת וידאו' }));
  expect(await screen.findByText('הקובץ חייב להיות עד 100 MB.')).toBeOnTheScreen();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
it('disables media selection when five attachments are present', async () => {
  await renderService(<MediaHarness initial={Array.from({ length: 5 }, (_, index) => ({ id: `media-${index}`, uri: 'file:///clip.mp4', contentType: 'video/mp4' }))} />);
  expect(screen.getByRole('button', { name: 'בחירת וידאו' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'בחירת תמונה' })).toBeDisabled();
});
