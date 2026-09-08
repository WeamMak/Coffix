import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import Contact from '../../app/(tabs)/(profile)/contact';
import Settings from '../../app/(tabs)/(profile)/settings';
import Faq from '../../app/(tabs)/(profile)/faq';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue('access') }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), canGoBack: () => false } }));
jest.mock('../../src/features/auth/useSession', () => ({ useSession: () => ({ sessionScope: 's1' }) }));
const information = { phone: '+97231234567', whatsapp: '+972501234567', opening_hours: 'א–ה 09:00–17:00', address: { city: 'חיפה', street: 'הרצל', building: '12' }, privacy_policy_url: 'https://shop.example/privacy', service_terms_url: 'https://shop.example/terms' };
function provider(children: React.ReactNode) { return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>{children}</QueryClientProvider>; }
const response = (body: unknown, status = 200) => ({ headers: new Headers(), ok: status < 400, status, text: async () => JSON.stringify(body) }) as Response;
beforeEach(() => { jest.restoreAllMocks(); globalThis.fetch = jest.fn().mockResolvedValue(response(information)); });

it('shows configured contact details and opens phone and WhatsApp actions', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await render(provider(<Contact />));
  expect(await screen.findByText('א–ה 09:00–17:00')).toBeOnTheScreen();
  expect(screen.getByText('הרצל 12, חיפה')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'התקשרו אלינו' }));
  expect(open).toHaveBeenCalledWith('tel:+97231234567');
  await fireEvent.press(screen.getByRole('button', { name: 'שליחת הודעה ב־WhatsApp' }));
  expect(open).toHaveBeenCalledWith('https://wa.me/972501234567');
});

it('explains missing contact and policy configuration without inactive actions', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue(response({ ...information, phone: null, whatsapp: null, opening_hours: null, privacy_policy_url: null, service_terms_url: null }));
  const result = await render(provider(<Contact />));
  expect(await screen.findByText('פרטי יצירת הקשר יעודכנו בקרוב.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'התקשרו אלינו' })).toBeNull();
  await result.unmount();
  await render(provider(<Settings />));
  expect(await screen.findByText('מסמכי הפרטיות ותנאי השירות יעודכנו בקרוב.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'מדיניות פרטיות' })).toBeNull();
});

it('offers device settings and configured policy links with visible opening errors', async () => {
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('unavailable'));
  await render(provider(<Settings />));
  await fireEvent.press(await screen.findByRole('button', { name: 'מדיניות פרטיות' }));
  expect(await screen.findByText('לא הצלחנו לפתוח את הקישור. אפשר לנסות שוב.')).toBeOnTheScreen();
  expect(open).toHaveBeenCalledWith('https://shop.example/privacy');
  await fireEvent.press(screen.getByRole('button', { name: 'פתיחת הגדרות המכשיר' }));
  await waitFor(() => expect(openSettings).toHaveBeenCalledTimes(1));
  expect(screen.getByText(/גרסת האפליקציה/)).toBeOnTheScreen();
  expect(screen.queryByRole('switch')).toBeNull();
});

it('provides FAQ answers consistent with the ordering and service flows', async () => {
  await render(<Faq />);
  await fireEvent.press(screen.getByRole('button', { name: 'איך קובעים שירות למכונה?' }));
  expect(screen.getByText(/המועד שבחרתם הוא בקשה/)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'איך קובעים שירות למכונה?', expanded: true })).toBeOnTheScreen();
});
