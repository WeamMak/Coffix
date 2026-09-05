import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RegisterMachineContent } from '../../app/(tabs)/(service)/register';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn().mockResolvedValue('access-token'),
  setItemAsync: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => {
  const context: { renderAsync: jest.Mock; resize: jest.Mock } = {
    renderAsync: jest.fn(),
    resize: jest.fn(),
  };
  context.resize.mockReturnValue(context);
  context.renderAsync.mockResolvedValue({
    saveAsync: jest.fn().mockResolvedValue({
      height: 800,
      uri: 'file://normalized.jpg',
      width: 600,
    }),
  });
  return {
    ImageManipulator: { manipulate: jest.fn(() => context) },
    SaveFormat: { JPEG: 'jpeg' },
  };
});

jest.mock('expo-file-system', () => ({
  File: jest.fn(),
}));

jest.mock('@react-native-community/datetimepicker', () => {
  const react = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  function MockDateTimePicker(props: Record<string, unknown>) {
    return react.createElement(View, { testID: 'ios-date-picker', ...props });
  }
  // Defined inline (not closing over an outer const): jest.mock factories run
  // lazily, the first time something requires the module — which can happen
  // before a same-named `const` above it has actually been assigned.
  return {
    __esModule: true,
    default: MockDateTimePicker,
    DateTimePickerAndroid: { open: jest.fn() },
  };
});

const safeAreaMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

// Two brands, two models each — matches the local seed catalog.
const models = [
  { id: 'model-bianca', manufacturer: 'Lelit', model_name: 'Bianca V3' },
  { id: 'model-mara', manufacturer: 'Lelit', model_name: 'Mara X' },
  { id: 'model-silvia-pro', manufacturer: 'Rancilio', model_name: 'Silvia Pro' },
];

function permissionGranted(granted: boolean) {
  return {
    canAskAgain: true,
    expires: 'never',
    granted,
    status: granted ? 'granted' : 'denied',
  } as never;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    headers: new Headers(),
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function mockFileInstance() {
  const instance = {
    createUploadTask: jest.fn(),
    size: 204800,
  };
  jest.mocked(FileSystem.File).mockImplementation(() => instance as never);
  return instance;
}

function mockSuccessfulUpload(instance: ReturnType<typeof mockFileInstance>) {
  instance.createUploadTask.mockImplementation((
    _url: string,
    options: { onProgress?: (progress: { bytesSent: number; totalBytes: number }) => void },
  ) => ({
    cancel: jest.fn(),
    uploadAsync: jest.fn().mockImplementation(async () => {
      options.onProgress?.({ bytesSent: 50, totalBytes: 100 });
      options.onProgress?.({ bytesSent: 100, totalBytes: 100 });
      return { body: '', headers: {}, status: 201 };
    }),
  }));
}

function mockFailedUpload(instance: ReturnType<typeof mockFileInstance>) {
  instance.createUploadTask.mockImplementation(() => ({
    cancel: jest.fn(),
    uploadAsync: jest.fn().mockResolvedValue({ body: '', headers: {}, status: 500 }),
  }));
}

function defaultFetcher(overrides: {
  createMachine?: (body: unknown) => Response;
  models?: typeof models;
} = {}) {
  const availableModels = overrides.models ?? models;
  return jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith('/api/v1/machines/models')) {
      return Promise.resolve(jsonResponse(availableModels));
    }
    if (path.endsWith('/api/v1/media/uploads')) {
      return Promise.resolve(jsonResponse({
        expires_at: '2026-05-01T09:00:00Z',
        headers: { 'Content-Type': 'image/jpeg' },
        method: 'PUT',
        upload_id: 'upload-1',
        upload_url: 'http://test/api/v1/media/uploads/upload-1/content',
      }, 201));
    }
    if (path.endsWith('/api/v1/media/uploads/upload-1/complete')) {
      return Promise.resolve(jsonResponse({
        collection_id: null,
        content_type: 'image/jpeg',
        created_at: '2026-05-01T08:00:00Z',
        id: 'media-1',
        owner_id: 'customer-1',
        purpose: 'machine_registration',
        size_bytes: 204800,
      }, 201));
    }
    if (path.endsWith('/api/v1/machines') && init?.method === 'POST') {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      return Promise.resolve(
        overrides.createMachine?.(body) ?? jsonResponse({
          created_at: '2026-05-01T08:00:00Z',
          customer_id: 'customer-1',
          id: 'machine-new',
          machine_model_id: body.machine_model_id,
          media_ids: body.media_id ? [body.media_id] : [],
          model: availableModels.find((model) => model.id === body.machine_model_id),
          purchase_date: body.purchase_date ?? null,
          serial_number: body.serial_number,
          serial_pending: false,
          service_history: [],
          source: 'manual',
          source_order_item_id: null,
          source_unit_index: null,
          updated_at: '2026-05-01T08:00:00Z',
          warranty_end_date: null,
          warranty_months: null,
          warranty_start_date: null,
        }, 201),
      );
    }
    return Promise.resolve(jsonResponse({}, 404));
  });
}

async function renderRegister(fetcher: jest.Mock) {
  globalThis.fetch = fetcher;
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  await render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <QueryClientProvider client={client}>
        <RegisterMachineContent sessionScope="session-1" />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

/** Types and taps through the brand/model typeahead fields. */
async function chooseModel(brand: string, model: string) {
  const brandInput = await screen.findByLabelText('מותג');
  await fireEvent(brandInput, 'focus');
  await fireEvent.press(await screen.findByRole('button', { name: brand }));
  const modelInput = screen.getByLabelText('דגם');
  await fireEvent(modelInput, 'focus');
  await fireEvent.press(await screen.findByRole('button', { name: model }));
}

describe('machine registration', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('requires a model and serial number before submitting', async () => {
    const fetcher = defaultFetcher();
    await renderRegister(fetcher);

    await screen.findByLabelText('מותג');
    await fireEvent.press(screen.getByRole('button', { name: 'רישום מכונה' }));

    expect(await screen.findByText('יש לבחור דגם מכונה.')).toBeOnTheScreen();
    expect(screen.getByText('יש להזין מספר סידורי.')).toBeOnTheScreen();
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/api/v1/machines'))).toBe(false);
  });

  it('requires choosing a brand before its models appear, filters suggestions as you type, and resets the model on brand change', async () => {
    await renderRegister(defaultFetcher());

    const brandInput = await screen.findByLabelText('מותג');
    expect(screen.getByText('יש לבחור מותג תחילה')).toBeOnTheScreen();

    await fireEvent(brandInput, 'focus');
    expect(await screen.findByRole('button', { name: 'Lelit' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Rancilio' })).toBeOnTheScreen();

    await fireEvent.changeText(brandInput, 'ranc');
    expect(screen.queryByRole('button', { name: 'Lelit' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Rancilio' }));

    const modelInput = screen.getByLabelText('דגם');
    await fireEvent(modelInput, 'focus');
    expect(await screen.findByRole('button', { name: 'Silvia Pro' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Bianca V3' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Silvia Pro' }));

    // Changing the brand clears the previously chosen model and its options.
    await fireEvent(brandInput, 'focus');
    await fireEvent.changeText(brandInput, 'Lelit');
    await fireEvent.press(await screen.findByRole('button', { name: 'Lelit' }));
    await fireEvent(modelInput, 'focus');
    expect(await screen.findByRole('button', { name: 'Bianca V3' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mara X' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Silvia Pro' })).toBeNull();
  });

  it('shows a no-matches message and blocks submission for an unlisted brand', async () => {
    await renderRegister(defaultFetcher());

    const brandInput = await screen.findByLabelText('מותג');
    await fireEvent(brandInput, 'focus');
    await fireEvent.changeText(brandInput, 'not-a-real-brand');

    expect(await screen.findByText('לא נמצאו מותגים תואמים')).toBeOnTheScreen();
    expect(screen.queryByLabelText('דגם')).toHaveProp('editable', false);

    await fireEvent.press(screen.getByRole('button', { name: 'רישום מכונה' }));
    expect(await screen.findByText('יש לבחור דגם מכונה.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('דגם')).not.toBeNull();
  });

  it('registers a machine from the selected model and entered serial', async () => {
    const fetcher = defaultFetcher();
    await renderRegister(fetcher);

    await chooseModel('Lelit', 'Bianca V3');
    await fireEvent.changeText(screen.getByLabelText('מספר סידורי'), 'LB-2024-9001');
    await fireEvent.press(screen.getByRole('button', { name: 'רישום מכונה' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(
      '/(tabs)/(service)/machines/machine-new',
    ));
    const createCall = fetcher.mock.calls.find(([url]) => String(url).endsWith('/api/v1/machines'));
    expect(createCall?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      machine_model_id: 'model-bianca',
      media_id: null,
      purchase_date: null,
      serial_number: 'LB-2024-9001',
    });
  });

  it('rejects a non-calendar or future purchase date', async () => {
    await renderRegister(defaultFetcher());

    await chooseModel('Lelit', 'Bianca V3');
    await fireEvent.changeText(screen.getByLabelText('מספר סידורי'), 'LB-2024-9001');
    await fireEvent.changeText(
      screen.getByLabelText('תאריך רכישה (אופציונלי)'),
      '2099-01-01',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'רישום מכונה' }));

    expect(await screen.findByText('תאריך הרכישה לא יכול להיות בעתיד.')).toBeOnTheScreen();
  });

  it('shows a duplicate-serial error from the server', async () => {
    const fetcher = defaultFetcher({
      createMachine: () => jsonResponse({
        code: 'MACHINE_SERIAL_ALREADY_REGISTERED',
        correlationId: 'x',
        status: 409,
        title: 'duplicate',
        type: 'about:blank',
      }, 409),
    });
    await renderRegister(fetcher);

    await chooseModel('Lelit', 'Bianca V3');
    await fireEvent.changeText(screen.getByLabelText('מספר סידורי'), 'LB-2024-0001');
    await fireEvent.press(screen.getByRole('button', { name: 'רישום מכונה' }));

    expect(await screen.findByText('מספר סידורי זה כבר רשום למכונה קיימת.')).toBeOnTheScreen();
  });

  it('explains when photo permission is not granted', async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(
      permissionGranted(false),
    );
    await renderRegister(defaultFetcher());

    await fireEvent.press(await screen.findByRole('button', { name: 'בחירת תמונה מהגלריה' }));

    expect(await screen.findByText(
      'יש לאשר גישה לתמונות בהגדרות המכשיר כדי לבחור תמונה.',
    )).toBeOnTheScreen();
  });

  it('uploads a picked photo with progress and attaches it to the submitted machine', async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(
      permissionGranted(true),
    );
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      assets: [{ height: 900, uri: 'file://picked.jpg', width: 1200 }],
      canceled: false,
    } as never);
    const fileInstance = mockFileInstance();
    mockSuccessfulUpload(fileInstance);
    const fetcher = defaultFetcher();
    await renderRegister(fetcher);

    await fireEvent.press(await screen.findByRole('button', { name: 'בחירת תמונה מהגלריה' }));
    expect(await screen.findByLabelText('תמונה הועלתה בהצלחה')).toBeOnTheScreen();

    await chooseModel('Rancilio', 'Silvia Pro');
    await fireEvent.changeText(screen.getByLabelText('מספר סידורי'), 'RS-2024-9001');
    await fireEvent.press(screen.getByRole('button', { name: 'רישום מכונה' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const createCall = fetcher.mock.calls.find(([url]) => String(url).endsWith('/api/v1/machines'));
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual(expect.objectContaining({
      machine_model_id: 'model-silvia-pro',
      media_id: 'media-1',
    }));
  });

  it('lets the customer retry a failed photo upload', async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(
      permissionGranted(true),
    );
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      assets: [{ height: 900, uri: 'file://picked.jpg', width: 1200 }],
      canceled: false,
    } as never);
    const fileInstance = mockFileInstance();
    mockFailedUpload(fileInstance);
    await renderRegister(defaultFetcher());

    await fireEvent.press(await screen.findByRole('button', { name: 'בחירת תמונה מהגלריה' }));
    expect(await screen.findByText('העלאת התמונה נכשלה.')).toBeOnTheScreen();

    mockSuccessfulUpload(fileInstance);
    await fireEvent.press(screen.getByRole('button', { name: 'ניסיון העלאה נוסף' }));
    expect(await screen.findByLabelText('תמונה הועלתה בהצלחה')).toBeOnTheScreen();
  });

  it('cancels an in-flight photo upload', async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(
      permissionGranted(true),
    );
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      assets: [{ height: 900, uri: 'file://picked.jpg', width: 1200 }],
      canceled: false,
    } as never);
    const fileInstance = mockFileInstance();
    const cancel = jest.fn();
    // Reports progress synchronously (as the native module would, ahead of
    // the transfer completing) and never resolves — cancellation must not
    // depend on the native upload settling.
    fileInstance.createUploadTask.mockImplementation((
      _url: string,
      options: { onProgress?: (progress: { bytesSent: number; totalBytes: number }) => void },
    ) => {
      options.onProgress?.({ bytesSent: 40, totalBytes: 80 });
      return {
        cancel,
        uploadAsync: jest.fn().mockImplementation(() => new Promise(() => {})),
      };
    });
    await renderRegister(defaultFetcher());

    await fireEvent.press(await screen.findByRole('button', { name: 'בחירת תמונה מהגלריה' }));
    expect(await screen.findByText(/50%/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'ביטול העלאת התמונה' }));

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/מעלים תמונה/)).toBeNull();
  });

  describe('purchase date picker', () => {
    const originalOS = Platform.OS;
    // Belt-and-suspenders: restore on both sides so a leaked value from
    // outside this block never affects these tests, and a leak from these
    // tests never reaches suites that run after this file.
    beforeEach(() => {
      Platform.OS = originalOS;
    });
    afterEach(() => {
      Platform.OS = originalOS;
    });

    it('opens the native Android dialog capped at today and applies the picked date', async () => {
      Platform.OS = 'android';
      await renderRegister(defaultFetcher());

      await fireEvent.press(await screen.findByRole('button', { name: 'בחירת תאריך מלוח שנה' }));

      const open = jest.mocked(DateTimePickerAndroid.open);
      expect(open).toHaveBeenCalledTimes(1);
      const options = open.mock.calls[0][0];
      expect(options.mode).toBe('date');
      expect(options.maximumDate?.toDateString()).toBe(new Date().toDateString());

      await act(async () => {
        options.onValueChange?.({} as never, new Date(2025, 4, 6));
      });
      expect(screen.getByLabelText('תאריך רכישה (אופציונלי)')).toHaveProp('value', '2025-05-06');
    });

    it('shows an inline picker on iOS and applies the picked date', async () => {
      Platform.OS = 'ios';
      await renderRegister(defaultFetcher());

      expect(screen.queryByTestId('ios-date-picker')).toBeNull();
      await fireEvent.press(await screen.findByRole('button', { name: 'בחירת תאריך מלוח שנה' }));

      const picker = screen.getByTestId('ios-date-picker');
      await fireEvent(picker, 'valueChange', {}, new Date(2025, 4, 6));

      expect(screen.getByLabelText('תאריך רכישה (אופציונלי)')).toHaveProp('value', '2025-05-06');
      expect(screen.queryByTestId('ios-date-picker')).toBeNull();
    });
  });
});
