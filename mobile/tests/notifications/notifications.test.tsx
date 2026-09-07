import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { NotificationsContent } from '../../app/notifications';
import { NotificationButton } from '../../src/components/NotificationButton';
import type { Notification } from '../../src/features/notifications/api';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue('access'), deleteItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), canGoBack: () => false, replace: jest.fn() }, useFocusEffect: jest.fn() }));
const id = '00000000-0000-4000-8000-000000000001';
const entityId = '00000000-0000-4000-8000-000000000002';
const notification: Notification = { id, type: 'order.shipped', title_he: 'ההזמנה נשלחה', body_he: 'בדרך אליך', related_entity_type: 'order', related_entity_id: entityId, read_at: null, created_at: '2026-09-07T09:00:00Z' };
export function response(payload: unknown, status = 200): Response {
  return { headers: new Headers(), ok: status < 400, status, text: async () => JSON.stringify(payload) } as Response;
}
function setup(foreign = false) {
  let read = false;
  globalThis.fetch = jest.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('/unread-count')) return response({ unread_count: read ? 0 : 1 });
    if (url.endsWith('/read')) { read = true; return response({ ...notification, read_at: '2026-09-07T10:00:00Z' }); }
    if (url.includes('/orders/')) return response(foreign ? { code: 'ORDER_NOT_FOUND' } : { id: entityId }, foreign ? 404 : 200);
    return response([{ ...notification, read_at: read ? '2026-09-07T10:00:00Z' : null }]);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><NotificationButton sessionScope="s1" /><NotificationsContent sessionScope="s1" /></QueryClientProvider>);
}
beforeEach(() => jest.clearAllMocks());
it('loads unread count, marks the notification read and verifies the order before navigation', async () => {
  await setup();
  expect(await screen.findByRole('button', { name: 'התראות, 1 לא נקראו' })).toBeOnTheScreen();
  await fireEvent.press(await screen.findByRole('button', { name: /ההזמנה נשלחה.*לא נקראה/ }));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(orders)/[orderId]', params: { orderId: entityId } }));
  expect(await screen.findByRole('button', { name: 'התראות, 0 לא נקראו' })).toBeOnTheScreen();
});
it('does not navigate when the related resource is hidden by ownership checks', async () => {
  await setup(true);
  await fireEvent.press(await screen.findByRole('button', { name: /ההזמנה נשלחה.*לא נקראה/ }));
  expect(await screen.findByText('לא ניתן לפתוח את העדכון כרגע. נסו שוב.')).toBeOnTheScreen();
  expect(router.push).not.toHaveBeenCalled();
});
