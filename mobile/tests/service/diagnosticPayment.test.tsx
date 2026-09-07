jest.mock('@stripe/stripe-react-native', () => ({ StripeProvider: ({ children }: { children: unknown }) => children, useStripe: () => ({ initPaymentSheet: jest.fn(), presentPaymentSheet: jest.fn() }) }));
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ServiceDetailContent } from '../../app/(tabs)/(service)/requests/[requestId]';
import { renderService, request, response } from './helpers';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }, useLocalSearchParams: jest.fn(), useFocusEffect: jest.fn() }));

it('uses a diagnostic command and reconciles an unknown provider result with the server', async () => {
  let current = request();
  const fetcher = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
    ? response({ payment_id: 'payment-1', provider_payment_id: 'fake-1', client_secret: 'secret', state: 'pending' })
    : response(current));
  globalThis.fetch = fetcher;
  const confirmer = { confirm: jest.fn(async () => {
    current = request({ state: 'awaiting_admin_review', allowed_actions: [] });
    throw new Error('lost response');
  }) };
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="session-1" confirmer={confirmer} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'תשלום דמי אבחון' }));
  expect(await screen.findByText('ממתין לבדיקת הצוות')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'תשלום דמי אבחון' })).toBeNull();
  expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/\/request-1\/diagnostic-payment$/), expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': 'mobile-service-request-1-diagnostic' }) }));
  expect(screen.queryByText('תור מאושר')).toBeNull();
});

it('takes allowed_actions as authoritative even when a cached state would otherwise allow payment', async () => {
  globalThis.fetch = jest.fn(async () => response(request({ allowed_actions: [] })));
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="session-1" confirmer={{ confirm: jest.fn() }} />);
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
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="session-1" confirmer={{ confirm: jest.fn() }} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'ביטול בקשה' }));
  await fireEvent.press(screen.getByRole('button', { name: 'אישור ביטול הבקשה' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'ביטול בקשה' })).toBeNull());
  expect(await screen.findByText('ממתין לבדיקת הצוות')).toBeOnTheScreen();
});
