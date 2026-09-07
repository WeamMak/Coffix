import { router } from 'expo-router';
jest.mock('@stripe/stripe-react-native', () => ({ StripeProvider: ({ children }: { children: unknown }) => children, useStripe: () => ({ initPaymentSheet: jest.fn(), presentPaymentSheet: jest.fn() }) }));
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ServiceDetailContent } from '../../app/(tabs)/(service)/requests/[requestId]';
import { renderService, request, response } from './helpers';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }, useLocalSearchParams: jest.fn(), useFocusEffect: jest.fn() }));

it('opens the dedicated diagnostic payment page without charging from the detail screen', async () => {
  const fetcher = jest.fn(async () => response(request()));
  globalThis.fetch = fetcher;
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="session-1" />);
  expect(await screen.findByTestId('service-payment-card')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'תשלום דמי אבחון' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(service)/requests/[requestId]/payment', params: { requestId: 'request-1', kind: 'diagnostic' } });
});

it('takes allowed_actions as authoritative even when a cached state would otherwise allow payment', async () => {
  globalThis.fetch = jest.fn(async () => response(request({ allowed_actions: [] })));
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="session-1" />);
  await screen.findByText('SR-1001');
  expect(screen.queryByRole('button', { name: 'תשלום דמי אבחון' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'ביטול בקשה' })).toBeNull();
});

it('allows prepayment cancellation and reconciles a forbidden stale action', async () => {
  let current = request();
  globalThis.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      current = request({ state: 'awaiting_admin_review', allowed_actions: [] });
      return response({ code: 'SERVICE_TRANSITION_NOT_ALLOWED', status: 409, title: 'Conflict', type: 'about:blank', correlationId: 'c' }, 409);
    }
    return response(current);
  });
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="session-1" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'ביטול בקשה' }));
  await fireEvent.press(screen.getByRole('button', { name: 'אישור ביטול הבקשה' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'ביטול בקשה' })).toBeNull());
  expect(await screen.findByText('ממתין לבדיקת הצוות')).toBeOnTheScreen();
});
