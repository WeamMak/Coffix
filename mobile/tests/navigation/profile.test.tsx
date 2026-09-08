import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from '../../src/components/Text';
import { ProfileGate } from '../../src/features/profile/ProfileGate';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue('access') }));
const mockSession = { status: 'authenticated', sessionScope: 's1', logout: jest.fn() };
jest.mock('../../src/features/auth/useSession', () => ({ useSession: () => mockSession }));
const profile = { id: 'u1', display_name: null, email: null, phone_e164: '+972501234567', profile_complete: false, role: 'customer', is_active: true };
const response = (body: unknown) => ({ headers: new Headers(), ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;

it('withholds cold-start deep links and route replacements until profile completion without unmounting the root navigator', async () => {
  let completed = false;
  globalThis.fetch = jest.fn().mockImplementation(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'PATCH') completed = true;
    return response({ ...profile, display_name: completed ? 'מאיה' : null, profile_complete: completed });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await renderRouter({
    _layout: () => <SafeAreaProvider><QueryClientProvider client={client}><Stack layout={ProfileGate} screenOptions={{ headerShown: false }} /></QueryClientProvider></SafeAreaProvider>,
    index: () => <Text>Home content</Text>,
    notifications: () => <Text>Private notifications</Text>,
  }, { initialUrl: '/notifications' });
  expect(await screen.findByText('השלמת פרטים אישיים')).toBeOnTheScreen();
  expect(screen.queryByText('Private notifications')).toBeNull();
  await act(async () => { router.replace('/'); });
  expect(screen.queryByText('Home content')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('שם מלא *'), 'מאיה');
  await fireEvent.press(screen.getByRole('button', { name: 'שמירה והמשך' }));
  expect(await screen.findByText('Home content')).toBeOnTheScreen();
});
