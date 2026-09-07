import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { IntakeContent } from '../../src/features/service/IntakeScreen';
import { emptyDraft, intakeStore } from '../../src/features/service/intakeStore';
import { renderService, request, response } from './helpers';

const mockReset = jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn() }, useNavigation: () => ({ reset: mockReset }), useLocalSearchParams: jest.fn(), useFocusEffect: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const options = { version: 1, urgencies: [{ id: 'normal', name_he: 'רגיל', description_he: 'תוך 3–5 ימי עסקים', surcharge_percent: 0 }, { id: 'urgent', name_he: 'דחוף', description_he: 'תוך 24 שעות', surcharge_percent: 30 }], preferred_windows: [{ start: '2026-09-08T08:00:00+03:00', end: '2026-09-08T12:00:00+03:00' }], response_hours: 4, service_types: [{ id: 'repair', label_he: 'תיקון', icon_key: 'tool', tags_he: ['תקלה', 'לחץ'], diagnostic_fee_agorot: 12500 }], shop_address: { street: 'הרצל', building: '10', city: 'חיפה', country: 'IL' }, max_media_files: 5, max_image_bytes: 10485760, max_video_bytes: 104857600 };
const machine = { id: 'machine-1', model: { manufacturer: 'Coffix', model_name: 'Pro' } };
let requests: ReturnType<typeof request>[];
let submitted: unknown[];
let loseResponse: boolean;
beforeEach(() => {
  jest.clearAllMocks();
  const disk = new Map<string, string>();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => disk.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { disk.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { disk.delete(key); });
  requests = []; submitted = []; loseResponse = false;
  globalThis.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      submitted.push(JSON.parse(String(init.body)));
      requests.push(request({ preferred_window_start: null, preferred_window_end: null }));
      if (loseResponse) throw new Error('lost response');
      return response(requests[0]);
    }
    if (String(url).endsWith('/service-options')) return response(options);
    if (String(url).endsWith('/service-requests')) return response(requests);
    if (String(url).endsWith('/addresses')) return response([]);
    return response(machine);
  });
});

it('offers only server-supported types and persists selection before continuing', async () => {
  await renderService(<IntakeContent machineId="machine-1" sessionScope="s" step={0} />);
  await fireEvent.press(await screen.findByRole('radio', { name: 'תיקון, ₪125' }));
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(service)/request/issue', params: { machineId: 'machine-1' } }));
  expect((await intakeStore.load('s', 'machine-1')).serviceTypeId).toBe('repair');
});
it('blocks a short issue and shows media size and count limits', async () => {
  await intakeStore.save('s', { ...emptyDraft('machine-1'), serviceTypeId: 'repair' });
  await renderService(<IntakeContent machineId="machine-1" sessionScope="s" step={1} />);
  await fireEvent.changeText(await screen.findByLabelText('תיאור התקלה'), 'קצר');
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  expect(await screen.findByText('יש להזין תיאור באורך 10–4000 תווים.')).toBeOnTheScreen();
  expect(screen.getByText('עד 5 קבצים · תמונה עד 10 MB · וידאו MP4 עד 100 MB')).toBeOnTheScreen();
  expect(router.push).not.toHaveBeenCalled();
});
it('labels preferred time as a request and requires a pickup address', async () => {
  await intakeStore.save('s', { ...emptyDraft('machine-1'), serviceTypeId: 'repair', description: 'המכונה לא מתחממת' });
  await renderService(<IntakeContent machineId="machine-1" sessionScope="s" step={2} />);
  expect(await screen.findByText(/המועד המועדף הוא בקשה בלבד/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'איסוף מהבית' }));
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  expect(await screen.findByText('יש להזין כתובת איסוף ישראלית מלאה וטלפון תקין.')).toBeOnTheScreen();
});
it.each([false, true])('reviews fees and clears the draft after verified submission (lost response: %s)', async lost => {
  loseResponse = lost;
  await intakeStore.save('s', { ...emptyDraft('machine-1'), serviceTypeId: 'repair', description: 'המכונה לא מתחממת' });
  await renderService(<IntakeContent machineId="machine-1" sessionScope="s" step={3} />);
  expect(await screen.findByText(/אגרת האבחון תיקבע לאחר סקירת הצוות/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'שליחת בקשה' }));
  await waitFor(() => expect(mockReset).toHaveBeenCalledWith({ index: 2, routes: [{ name: 'index' }, { name: 'machines/[machineId]', params: { machineId: 'machine-1' } }, { name: 'request/confirmation', params: { requestId: 'request-1' } }] }));
  expect(submitted).toHaveLength(1);
  expect(submitted[0]).toEqual({ service_type_id: 'repair', description: 'המכונה לא מתחממת', location_mode: 'bring_in', media_ids: [], urgency_id: 'normal', intake_version: 1 });
  expect((await intakeStore.load('s', 'machine-1')).description).toBe('');
});
it('an unresolved submission survives screen reopening and cannot send a duplicate', async () => {
  const draft = { ...emptyDraft('machine-1'), serviceTypeId: 'repair', description: 'המכונה לא מתחממת' };
  await intakeStore.save('s', { ...draft, submission: { existingIds: [], input: { urgency_id: 'normal', service_type_id: 'repair', description: draft.description, location_mode: 'bring_in', media_ids: [] } } });
  await renderService(<IntakeContent machineId="machine-1" sessionScope="s" step={3} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'בדיקת מצב השליחה' }));
  expect(await screen.findByText('עדיין לא ניתן לוודא אם הבקשה נשלחה. רעננו שוב או פנו לצוות לפני שליחה נוספת.')).toBeOnTheScreen();
  expect(submitted).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'שליחת בקשה' })).toBeNull();
});

it('reloads the latest draft when an earlier mounted step regains focus', async () => {
  await intakeStore.save('s', { ...emptyDraft('machine-1'), serviceTypeId: 'repair' });
  await renderService(<IntakeContent machineId="machine-1" sessionScope="s" step={0} />);
  await screen.findByRole('radio', { name: 'תיקון, ₪125' });
  await intakeStore.save('s', { ...await intakeStore.load('s', 'machine-1'), description: 'פרטים שנשמרו בשלב הבא' });
  await act(async () => { jest.mocked(useFocusEffect).mock.calls.at(-1)![0](); });
  await fireEvent.press(await screen.findByRole('radio', { name: 'תיקון, ₪125' }));
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  await waitFor(() => expect(router.push).toHaveBeenCalled());
  expect((await intakeStore.load('s', 'machine-1')).description).toBe('פרטים שנשמרו בשלב הבא');
});


it('shows the machine thumbnail, dynamic service tags, and selected dark icon', async () => {
  await renderService(<IntakeContent machineId="machine-1" sessionScope="s" step={0} />);
  expect(await screen.findByLabelText('תמונת Coffix Pro')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'המכונה: Coffix Pro' })).toBeNull();
  expect(screen.getByText('תקלה, לחץ')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: 'תיקון, ₪125' }));
  expect(screen.getByTestId('service-icon-repair')).toHaveStyle({ backgroundColor: '#2B1810' });
});
it('persists a server urgency choice with its description and percentage', async () => {
  await intakeStore.save('s', { ...emptyDraft('machine-1'), serviceTypeId: 'repair', description: 'המכונה לא מתחממת' });
  await renderService(<IntakeContent machineId="machine-1" sessionScope="s" step={1} />);
  await fireEvent.press(await screen.findByRole('radio', { name: 'דחוף, תוך 24 שעות, +30%' }));
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  await waitFor(() => expect(router.push).toHaveBeenCalled());
  expect((await intakeStore.load('s', 'machine-1')).urgencyId).toBe('urgent');
});

it('selects only offered date slots and persists the Israel-local window', async () => {
  await intakeStore.save('s', { ...emptyDraft('machine-1'), serviceTypeId: 'repair', description: 'המכונה לא מתחממת' });
  await renderService(<IntakeContent machineId="machine-1" sessionScope="s" step={2} />);
  await fireEvent.press(await screen.findByRole('radio', { name: '08:00 – 12:00' }));
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  await waitFor(() => expect(router.push).toHaveBeenCalled());
  expect((await intakeStore.load('s', 'machine-1')).preferredStart).toBe('2026-09-08T08:00:00+03:00');
});

it('uses the default profile address and opens the address route', async () => {
  const saved = [
    { id: 'home', recipient_name: 'לקוח', street: 'הרצל', building: '10', city: 'חיפה', is_default: true },
    { id: 'work', recipient_name: 'לקוח', street: 'יפו', building: '2', city: 'ירושלים', is_default: false },
  ];
  const fallback = globalThis.fetch;
  globalThis.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/addresses')) {
      if (init?.method === 'POST') return response({ ...JSON.parse(String(init.body)), id: 'new-address' }, 201);
      return response(saved);
    }
    return fallback(url, init);
  });
  await intakeStore.save('s', { ...emptyDraft('machine-1'), serviceTypeId: 'repair', description: 'המכונה לא מתחממת', locationMode: 'pickup' });
  await renderService(<IntakeContent machineId="machine-1" sessionScope="s" step={2} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'בחירת כתובת איסוף: לקוח, הרצל, 10, חיפה' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(service)/request/addresses', params: { machineId: 'machine-1' } });
  expect((await intakeStore.load('s', 'machine-1')).addressId).toBe('home');
});

it('refreshes changed urgency pricing for another review instead of submitting stale choices', async () => {
  await intakeStore.save('s', { ...emptyDraft('machine-1'), serviceTypeId: 'repair', description: 'המכונה לא מתחממת' });
  await renderService(<IntakeContent machineId="machine-1" sessionScope="s" step={3} />);
  await screen.findByText(/אגרת האבחון תיקבע לאחר סקירת הצוות/);
  const fallback = globalThis.fetch;
  globalThis.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => String(url).endsWith('/service-options') ? response({ ...options, version: 2, urgencies: [{ ...options.urgencies[0], surcharge_percent: 20 }] }) : fallback(url, init));
  await fireEvent.press(screen.getByRole('button', { name: 'שליחת בקשה' }));
  expect(await screen.findByText('פרטי השירות השתנו. יש לבדוק את הסיכום המעודכן ולשלוח שוב.')).toBeOnTheScreen();
  expect(screen.getByText('רגיל · +20%')).toBeOnTheScreen();
  expect(submitted).toHaveLength(0);
});
