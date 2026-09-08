import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { ProfileContent } from '../../app/(tabs)/(profile)/index';
import { NotificationsContent } from '../../app/notifications';
import { colors } from '../../src/theme';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue('token'), deleteItemAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
const response = (data: unknown) => ({ headers: new Headers(), ok: true, status: 200, text: async () => JSON.stringify(data) }) as Response;
it('uses the handoff hierarchy with real identity and omits unsupported prototype account features', async () => {
  globalThis.fetch = jest.fn().mockImplementation(async (url: string) => response(url.endsWith('/users/me') ? { id: 'u1', display_name: 'מאיה לוי', phone_e164: '+972501234567', role: 'customer', is_active: true } : url.includes('unread-count') ? { unread_count: 0 } : []));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={client}><ProfileContent sessionScope="s1" logout={jest.fn()} /></QueryClientProvider>);
  expect(await screen.findByText('מאיה לוי')).toHaveStyle({ color: colors.cream });
  expect(screen.getByRole('header', { name: 'הפרופיל שלי' })).toBeOnTheScreen();
  expect(screen.getByText('החשבון שלי')).toBeOnTheScreen();
  expect(screen.getByText('הפעילות שלי')).toBeOnTheScreen();
  expect(screen.queryByText('מועדפים')).not.toBeOnTheScreen();
  expect(screen.queryByText('₪240')).not.toBeOnTheScreen();
});
it('distinguishes read and unread cards without clipping long Hebrew notification copy', async () => {
  const body = 'פרטי בקשת השירות המעודכנים זמינים באפליקציה. '.repeat(8);
  globalThis.fetch = jest.fn().mockResolvedValue(response([
    { id: 'n1', title_he: 'נקבע מועד', body_he: body, type: 'service.request.scheduled', related_entity_type: 'service_request', related_entity_id: null, read_at: null, created_at: '2026-09-07T09:00:00Z' },
    { id: 'n2', title_he: 'התשלום התקבל', body_he: 'תודה', type: 'order.paid', related_entity_type: 'order', related_entity_id: null, read_at: '2026-09-07T09:00:00Z', created_at: '2026-09-07T09:00:00Z' },
  ]));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={client}><NotificationsContent sessionScope="s1" /></QueryClientProvider>);
  expect(await screen.findByRole('button', { name: /נקבע מועד.*לא נקראה/ })).toHaveStyle({ backgroundColor: colors.accentSoft, direction: 'rtl' });
  expect(screen.getByRole('button', { name: /התשלום התקבל.*נקראה/ })).toHaveStyle({ backgroundColor: colors.card });
  expect(screen.getByText(body)).not.toHaveProp('numberOfLines');
  expect(screen.getByText(body)).toHaveProp('allowFontScaling', true);
});
