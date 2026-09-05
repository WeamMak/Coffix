import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { resolveApiBaseUrl } from '../../src/api/client';
import { uploadMachineRegistrationPhoto } from '../../src/features/media/uploader';

jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn().mockResolvedValue('access-token'),
  setItemAsync: jest.fn(),
}));

const image = {
  contentType: 'image/jpeg' as const,
  height: 800,
  sizeBytes: 200,
  uri: 'file://photo.jpg',
  width: 600,
};
const baseUrl = resolveApiBaseUrl({
  configuredUrl: process.env.EXPO_PUBLIC_API_URL,
  platform: Platform.OS,
});

function jsonResponse(payload: unknown): Response {
  return { ok: true, status: 201, text: async () => JSON.stringify(payload) } as Response;
}

describe('machine photo upload transport', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [`${baseUrl}/api/v1/media/uploads/upload-1/content`, true],
    ['https://bucket.s3.amazonaws.com/photo?X-Amz-Signature=signed', false],
    [`${baseUrl}/unrelated-upload`, false],
  ])('scopes API credentials for %s', async (uploadUrl, needsApiToken) => {
    const createUploadTask = jest.fn().mockReturnValue({
      cancel: jest.fn(),
      uploadAsync: jest.fn().mockResolvedValue({ status: 200 }),
    });
    jest.mocked(File).mockImplementation(() => ({ createUploadTask }) as never);
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        upload_id: 'upload-1', upload_url: uploadUrl, method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg', 'x-provider-header': 'signed-value' },
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 'media-1' }));

    expect(await uploadMachineRegistrationPhoto(image).result).toBe('media-1');
    expect(createUploadTask).toHaveBeenCalledWith(uploadUrl, expect.objectContaining({
      headers: {
        'Content-Type': 'image/jpeg',
        'x-provider-header': 'signed-value',
        ...(needsApiToken ? { Authorization: 'Bearer access-token' } : {}),
      },
    }));
  });
});
