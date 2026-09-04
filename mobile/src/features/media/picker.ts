import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type PickedImage = {
  contentType: 'image/jpeg';
  height: number;
  sizeBytes: number;
  uri: string;
  width: number;
};

export type PickerSource = 'camera' | 'library';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export class MachinePhotoPermissionError extends Error {
  constructor(readonly source: PickerSource) {
    super(`${source} permission was not granted`);
    this.name = 'MachinePhotoPermissionError';
  }
}

async function ensurePermission(source: PickerSource): Promise<void> {
  const response = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!response.granted) {
    throw new MachinePhotoPermissionError(source);
  }
}

// Normalizes any picked asset (including HEIC) to a size-capped JPEG so the
// uploader always sends one predictable content type and a bounded byte size.
export async function normalizeImage(
  uri: string,
  knownWidth?: number,
): Promise<PickedImage> {
  let context = ImageManipulator.manipulate(uri);
  if (!knownWidth || knownWidth > MAX_DIMENSION) {
    context = context.resize({ width: MAX_DIMENSION });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
  const file = new File(saved.uri);
  return {
    contentType: 'image/jpeg',
    height: saved.height,
    sizeBytes: file.size ?? 0,
    uri: saved.uri,
    width: saved.width,
  };
}

export async function pickMachinePhoto(source: PickerSource): Promise<PickedImage | null> {
  await ensurePermission(source);
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0]!;
  return normalizeImage(asset.uri, asset.width || undefined);
}
