import { useCallback, useEffect, useRef, useState } from 'react';

import {
  MachinePhotoPermissionError,
  pickMachinePhoto,
  type PickedImage,
  type PickerSource,
} from './picker';
import {
  discardRegistrationPhoto,
  uploadMachineRegistrationPhoto,
  type MediaUploadHandle,
} from './uploader';

type PhotoState =
  | { status: 'idle' | 'picking' }
  | { status: 'uploading'; progress: number; uri: string }
  | { status: 'done'; mediaId: string; uri: string }
  | { status: 'error'; image?: PickedImage; message: string };

type PhotoOperation = { handle?: MediaUploadHandle; mediaId?: string };

function discard(mediaId: string): void {
  // The server also reclaims unattached photos if this request cannot finish.
  void discardRegistrationPhoto(mediaId).catch(() => {});
}

export function useRegistrationPhoto() {
  const [photo, setPhoto] = useState<PhotoState>({ status: 'idle' });
  const operation = useRef<PhotoOperation | null>(null);

  const clearOperation = useCallback(() => {
    const previous = operation.current;
    operation.current = null;
    previous?.handle?.cancel();
    if (previous?.mediaId) {
      discard(previous.mediaId);
    }
  }, []);

  useEffect(() => clearOperation, [clearOperation]);

  const cancelUpload = () => {
    clearOperation();
    setPhoto({ status: 'idle' });
  };

  const startUpload = (image: PickedImage, current: PhotoOperation) => {
    const handle = uploadMachineRegistrationPhoto(image, ({ bytesSent, totalBytes }) => {
      if (operation.current !== current) {
        return;
      }
      const progress = totalBytes > 0 ? Math.min(1, bytesSent / totalBytes) : 0;
      setPhoto({ progress, status: 'uploading', uri: image.uri });
    });
    current.handle = handle;
    setPhoto({ progress: 0, status: 'uploading', uri: image.uri });
    void handle.result.then(
      (mediaId) => {
        if (operation.current !== current) {
          discard(mediaId);
          return;
        }
        current.mediaId = mediaId;
        setPhoto({ mediaId, status: 'done', uri: image.uri });
      },
      () => {
        if (operation.current === current) {
          setPhoto({ image, message: 'העלאת התמונה נכשלה.', status: 'error' });
        }
      },
    );
  };

  const pickPhoto = async (source: PickerSource) => {
    clearOperation();
    const current: PhotoOperation = {};
    operation.current = current;
    setPhoto({ status: 'picking' });
    try {
      const image = await pickMachinePhoto(source);
      if (operation.current !== current) {
        return;
      }
      if (image) {
        startUpload(image, current);
      } else {
        setPhoto({ status: 'idle' });
      }
    } catch (error) {
      if (operation.current !== current) {
        return;
      }
      const message = error instanceof MachinePhotoPermissionError
        ? source === 'camera'
          ? 'יש לאשר גישה למצלמה בהגדרות המכשיר כדי לצלם תמונה.'
          : 'יש לאשר גישה לתמונות בהגדרות המכשיר כדי לבחור תמונה.'
        : 'לא הצלחנו להכין את התמונה. נסו לצלם או לבחור תמונה אחרת.';
      setPhoto({ message, status: 'error' });
    }
  };

  const retry = () => {
    if (photo.status !== 'error' || !photo.image) {
      return;
    }
    clearOperation();
    const current: PhotoOperation = {};
    operation.current = current;
    startUpload(photo.image, current);
  };

  return {
    cancelUpload,
    isBusy: photo.status === 'picking' || photo.status === 'uploading',
    mediaId: photo.status === 'done' ? photo.mediaId : null,
    photo,
    pickPhoto,
    // A successful registration owns the attachment now; unmount must keep it.
    retain: () => { operation.current = null; },
    retry,
  };
}
