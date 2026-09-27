import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, PermissionsAndroid, Platform, type AppStateStatus } from 'react-native';
import { PushPermissionState, PushProvider } from '../../src/features/notifications/PushProvider';
import { androidNotificationPermission } from '../../src/features/notifications/nativePush';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone' },
  ExecutionEnvironment: { StoreClient: 'storeClient' },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue('access') }));
jest.mock('../../src/features/auth/useSession', () => ({
  useSession: () => ({ sessionScope: 'android-session', status: 'authenticated' }),
}));
// Keep the real permission adapter and provider lifecycle; replace only Firebase.
jest.mock('../../src/features/notifications/nativePush', () => {
  const actual = jest.requireActual('../../src/features/notifications/nativePush');
  return { ...actual, loadPushDevice: jest.fn(async () => ({
    platform: 'android', permission: actual.androidNotificationPermission,
    deleteToken: jest.fn().mockResolvedValue(undefined),
  })) };
});

afterEach(() => jest.restoreAllMocks());

it('does not reopen denied Android permission when its activity returns focus, and reads later settings changes', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version');
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 36 });
  const listeners = new Set<(state: AppStateStatus) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener);
    return { remove: () => { listeners.delete(listener); } };
  });
  const check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
  const client = new QueryClient();
  try {
    const rendered = await render(<QueryClientProvider client={client}>
      <PushProvider><PushPermissionState /></PushProvider>
    </QueryClientProvider>);
    await screen.findByText(/ההתראות חסומות/);
    for (let i = 0; i < 4; i++) {
      await act(async () => { for (const listener of [...listeners]) listener('active'); });
      await waitFor(() => expect(screen.getByText(/ההתראות חסומות/)).toBeOnTheScreen());
    }
    expect(request).toHaveBeenCalledTimes(1);
    await rendered.unmount();
    check.mockResolvedValue(true);
    await expect(androidNotificationPermission()).resolves.toBe(true);
    check.mockResolvedValue(false);
    await expect(androidNotificationPermission()).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    if (version) Object.defineProperty(Platform, 'Version', version);
    client.clear();
  }
});
