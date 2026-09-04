import type { components } from '@coffix/api-client';
import { File } from 'expo-file-system';

import { apiClient } from '../../api/client';
import { secureTokenStore } from '../auth/store';
import type { PickedImage } from './picker';

type MediaUploadCreated = components['schemas']['MediaUploadCreated'];
type MediaRead = components['schemas']['MediaRead'];
type MediaPurpose = components['schemas']['MediaPurpose'];

export type MediaUploadProgress = { bytesSent: number; totalBytes: number };

export type MediaUploadHandle = {
  /** Aborts the in-flight upload. The server reclaims the abandoned upload row on its own. */
  cancel(): void;
  /** Resolves to the completed media's id. */
  result: Promise<string>;
};

export class MediaUploadCancelledError extends Error {
  constructor() {
    super('media upload was cancelled');
    this.name = 'MediaUploadCancelledError';
  }
}

export class MediaUploadFailedError extends Error {
  constructor(readonly status: number) {
    super(`media upload failed with status ${status}`);
    this.name = 'MediaUploadFailedError';
  }
}

function createUpload(
  purpose: MediaPurpose,
  image: PickedImage,
): Promise<MediaUploadCreated> {
  return apiClient.request('/api/v1/media/uploads', {
    body: {
      content_type: image.contentType,
      purpose,
      size_bytes: image.sizeBytes,
    },
    method: 'POST',
  });
}

function completeUpload(uploadId: string): Promise<MediaRead> {
  return apiClient.request(
    `/api/v1/media/uploads/${encodeURIComponent(uploadId)}/complete`,
    { method: 'POST' },
  );
}

export function uploadMachineRegistrationPhoto(
  image: PickedImage,
  onProgress?: (progress: MediaUploadProgress) => void,
): MediaUploadHandle {
  let cancelled = false;
  let task: { cancel(): void } | null = null;

  const result = (async () => {
    const created = await createUpload('machine_registration', image);
    if (cancelled) {
      throw new MediaUploadCancelledError();
    }

    const accessToken = await secureTokenStore.getAccessToken();
    const file = new File(image.uri);
    const uploadTask = file.createUploadTask(created.upload_url, {
      headers: {
        ...created.headers,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      httpMethod: created.method === 'PUT' ? 'PUT' : 'POST',
      onProgress,
    });
    task = uploadTask;
    if (cancelled) {
      uploadTask.cancel();
      throw new MediaUploadCancelledError();
    }

    const response = await uploadTask.uploadAsync();
    if (cancelled) {
      throw new MediaUploadCancelledError();
    }
    if (response.status < 200 || response.status >= 300) {
      throw new MediaUploadFailedError(response.status);
    }

    const media = await completeUpload(created.upload_id);
    return media.id;
  })();

  return {
    cancel() {
      cancelled = true;
      task?.cancel();
    },
    result,
  };
}
