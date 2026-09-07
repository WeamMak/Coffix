import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { router, Stack, usePathname } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MachineDetailContent } from '../../app/(tabs)/(service)/machines/[machineId]';
import ServiceLayout from '../../app/(tabs)/(service)/_layout';
import { Text } from '../../src/components/Text';
import { Button } from '../../src/components/Button';
import { IntakeContent } from '../../src/features/service/IntakeScreen';
import { ServicePaymentContent } from '../../src/features/service/ServicePaymentScreen';
import { ServiceDetailContent } from '../../app/(tabs)/(service)/requests/[requestId]';
import { ServiceConfirmationContent } from '../../app/(tabs)/(service)/request/confirmation';
import { intakeStore } from '../../src/features/service/intakeStore';
import { request, response } from '../service/helpers';

jest.mock('@stripe/stripe-react-native', () => ({ StripeProvider: ({ children }: { children: unknown }) => children, useStripe: () => ({}) }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({}));

const machine = {
  id: 'machine-1', model: { id: 'model-1', manufacturer: 'Coffix', model_name: 'Pro' },
  source: 'manual', serial_number: 'TEST-001', serial_pending: false, purchase_date: null,
  service_history: [], warranty_status: 'none', warranty_end_date: null,
};
function Pathname() { return <Text testID="pathname">{usePathname()}</Text>; }
async function renderFlow(initialUrl = '/(tabs)/(service)', paymentDue = false) {
  const disk = new Map<string, string>();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => disk.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { disk.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { disk.delete(key); });
  let submitted = false;
  const created = request({ state: paymentDue ? 'awaiting_diagnostic_payment' : 'awaiting_intake_review', diagnostic_fee_agorot: paymentDue ? 12500 : null, diagnostic_base_fee_agorot: paymentDue ? 12500 : null, allowed_actions: paymentDue ? ['cancel', 'pay_diagnostic'] : ['cancel'], preferred_window_start: null, preferred_window_end: null });
  globalThis.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/diagnostic-payment')) return response({ payment_id: 'p', provider_payment_id: 'fake-p', client_secret: 's', state: 'pending' });
    if (init?.method === 'POST') { submitted = true; return response(created, 201); }
    if (String(url).endsWith('/service-requests')) return response(submitted ? [created] : []);
    if (String(url).endsWith('/service-requests/request-1')) return response(created);
    return response(String(url).endsWith('/service-options') ? {
    version: 1, service_types: [{ id: 'repair', label_he: 'תיקון', tags_he: [], icon_key: 'tool', diagnostic_fee_agorot: 12500 }],
    urgencies: [{ id: 'normal', name_he: 'רגיל', description_he: 'תוך 3 ימים', surcharge_percent: 0 }],
    preferred_windows: [], shop_address: {}, max_media_files: 5, max_image_bytes: 10485760, max_video_bytes: 104857600,
  } : machine);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await renderRouter({
    _layout: () => <SafeAreaProvider><QueryClientProvider client={client}><Pathname /><Stack screenOptions={{ headerShown: false }} /></QueryClientProvider></SafeAreaProvider>,
    '(tabs)/(service)/_layout': ServiceLayout,
    '(tabs)/(service)/register': () => null,
    '(tabs)/(service)/request/machineId': () => null,
    '(tabs)/(service)/request/location': () => <IntakeContent machineId="machine-1" sessionScope="s" step={2} />,
    '(tabs)/(service)/request/review': () => <IntakeContent machineId="machine-1" sessionScope="s" step={3} />,
    '(tabs)/(service)/request/confirmation': () => <ServiceConfirmationContent requestId="request-1" sessionScope="s" />,
    '(tabs)/(service)/requests/[requestId]/payment': () => <ServicePaymentContent requestId="request-1" sessionScope="s" kind="diagnostic" confirmer={{ confirm: async () => ({ status: 'submitted' }) }} />,
    '(tabs)/(service)/requests/[requestId]': () => <ServiceDetailContent requestId="request-1" sessionScope="s" />,
    '(tabs)/(service)/index': () => <Button onPress={() => router.push('/(tabs)/(service)/machines/machine-1')}>פתיחת מכונה</Button>,
    '(tabs)/(service)/machines/[machineId]': () => <MachineDetailContent machineId="machine-1" sessionScope="s" />,
    '(tabs)/(service)/request/type': () => <IntakeContent machineId="machine-1" sessionScope="s" step={0} />,
    '(tabs)/(service)/request/issue': () => <IntakeContent machineId="machine-1" sessionScope="s" step={1} />,
  }, { initialUrl });
}

it('pops intake and machine screens once, including repeat entry and native Back', async () => {
  await renderFlow();
  for (let visit = 0; visit < 2; visit++) {
    await fireEvent.press(await screen.findByRole('button', { name: 'פתיחת מכונה' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'בקשת שירות למכונה זו' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'חזרה' }));
    await waitFor(() => expect(screen.getByTestId('pathname')).toHaveTextContent('/machines/machine-1'));
    if (visit === 0) await fireEvent.press(await screen.findByRole('button', { name: 'חזרה למכונות שלי' }));
    else await act(async () => router.back());
    await waitFor(() => expect(screen.getByTestId('pathname').props.children).toBe('/'));
    expect(await screen.findByRole('button', { name: 'פתיחת מכונה' })).toBeOnTheScreen();
  }
});

it('preserves draft edits while popping and revisiting individual intake steps', async () => {
  await renderFlow();
  await fireEvent.press(await screen.findByRole('button', { name: 'פתיחת מכונה' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'בקשת שירות למכונה זו' }));
  await fireEvent.press(await screen.findByRole('radio', { name: 'תיקון, ₪125' }));
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  await fireEvent.changeText(await screen.findByLabelText('תיאור התקלה'), 'המכונה לא מתחממת');
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  await screen.findByText('איך נאסוף את המכונה?');
  await fireEvent.press(screen.getByRole('button', { name: 'חזרה' }));
  expect(await screen.findByDisplayValue('המכונה לא מתחממת')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('תיאור התקלה'), 'המכונה גם לא מוציאה קפה');
  await act(async () => router.back());
  expect(await screen.findByRole('radio', { name: 'תיקון, ₪125' })).toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  expect(await screen.findByDisplayValue('המכונה גם לא מוציאה קפה')).toBeOnTheScreen();
  await act(async () => router.back());
  await screen.findByRole('radio', { name: 'תיקון, ₪125' });
  await act(async () => router.back());
  await screen.findByRole('button', { name: 'בקשת שירות למכונה זו' });
  await act(async () => router.back());
  expect(await screen.findByRole('button', { name: 'פתיחת מכונה' })).toBeOnTheScreen();
});

it.each(['header', 'native', 'tracking', 'machines'])('removes completed intake history when leaving confirmation via %s', async action => {
  await renderFlow();
  await fireEvent.press(await screen.findByRole('button', { name: 'פתיחת מכונה' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'בקשת שירות למכונה זו' }));
  await fireEvent.press(await screen.findByRole('radio', { name: 'תיקון, ₪125' }));
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  await fireEvent.changeText(await screen.findByLabelText('תיאור התקלה'), 'המכונה לא מתחממת');
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  await screen.findByText('איך נאסוף את המכונה?');
  await fireEvent.press(screen.getByRole('button', { name: 'המשך' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'שליחת בקשה' }));
  expect(await screen.findByText('הבקשה התקבלה.')).toBeOnTheScreen();
  expect((await intakeStore.load('s', 'machine-1')).description).toBe('');
  if (action === 'machines') {
    await fireEvent.press(screen.getByRole('button', { name: 'חזרה למכונות שלי' }));
  } else {
    if (action === 'tracking') {
      await fireEvent.press(screen.getByRole('button', { name: 'מעקב אחרי הבקשה' }));
      await waitFor(() => expect(screen.getByTestId('pathname')).toHaveTextContent('/requests/request-1'));
    }
    if (action === 'header' || action === 'tracking') await fireEvent.press(screen.getByRole('button', { name: 'חזרה' }));
    else await act(async () => router.back());
    await fireEvent.press(await screen.findByRole('button', { name: 'חזרה למכונות שלי' }));
  }
  expect(await screen.findByRole('button', { name: 'פתיחת מכונה' })).toBeOnTheScreen();
  expect(router.canGoBack()).toBe(false);
});

it('uses a safe parent for an intake deep link without history', async () => {
  await renderFlow('/(tabs)/(service)/request/type?machineId=machine-1');
  await screen.findByRole('radio', { name: 'תיקון, ₪125' });
  expect(router.canGoBack()).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'חזרה' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'חזרה למכונות שלי' }));
  expect(await screen.findByRole('button', { name: 'פתיחת מכונה' })).toBeOnTheScreen();
  expect(router.canGoBack()).toBe(false);
});

it('returns from payment to the existing request and then the existing machine', async () => {
  await renderFlow(undefined, true);
  await fireEvent.press(await screen.findByRole('button', { name: 'פתיחת מכונה' }));
  await screen.findByRole('button', { name: 'בקשת שירות למכונה זו' });
  await act(async () => router.push('/(tabs)/(service)/requests/request-1'));
  await fireEvent.press(await screen.findByRole('button', { name: 'תשלום דמי אבחון' }));
  await screen.findByText('ממתינים לאישור התשלום מהשרת');
  await fireEvent.press(screen.getByRole('button', { name: 'חזרה' }));
  expect(await screen.findByTestId('service-payment-card')).toBeOnTheScreen();
  await act(async () => router.back());
  await fireEvent.press(await screen.findByRole('button', { name: 'חזרה למכונות שלי' }));
  expect(await screen.findByRole('button', { name: 'פתיחת מכונה' })).toBeOnTheScreen();
  expect(router.canGoBack()).toBe(false);
});
