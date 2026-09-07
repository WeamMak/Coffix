import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ServicePaymentContent } from '../../src/features/service/ServicePaymentScreen';
import { renderService, request, response } from './helpers';

jest.mock('@stripe/stripe-react-native', () => ({ StripeProvider: ({ children }: { children: unknown }) => children, useStripe: () => ({}) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() }, useLocalSearchParams: jest.fn(), useFocusEffect: jest.fn() }));

it.each(['diagnostic', 'additional'] as const)('retries the same %s intent and shows success only after the server records confirmation', async kind => {
  let current = request({ state: kind === 'diagnostic' ? 'awaiting_diagnostic_payment' : 'awaiting_additional_payment', allowed_actions: [kind === 'diagnostic' ? 'pay_diagnostic' : 'pay_additional'] });
  const fetcher = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
    ? response({ payment_id: 'payment-1', provider_payment_id: 'fake-1', client_secret: 'secret', state: 'failed' }) : response(current));
  globalThis.fetch = fetcher;
  const confirmer = { confirm: jest.fn().mockResolvedValueOnce({ status: 'declined', message: 'התשלום נדחה. נסו שוב.' }).mockResolvedValue({ status: 'submitted' }) };
  await renderService(<ServicePaymentContent requestId="request-1" sessionScope="s" kind={kind} confirmer={confirmer} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'ניסיון נוסף' }));
  expect(await screen.findByText('ממתינים לאישור התשלום מהשרת')).toBeOnTheScreen();
  expect(screen.queryByText('התשלום התקבל בהצלחה')).toBeNull();
  expect(confirmer.confirm).toHaveBeenCalledTimes(2);
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(2);
  for (const [url, init] of posts) {
    expect(String(url)).toMatch(new RegExp(`/${kind}-payment$`));
    expect(init?.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': `mobile-service-request-1-${kind}` }));
  }
  current = request({ state: kind === 'diagnostic' ? 'awaiting_admin_review' : 'repair_in_progress', allowed_actions: [], history: [{ from_state: current.state, to_state: kind === 'diagnostic' ? 'awaiting_admin_review' : 'repair_in_progress', source: 'system', reason: 'payment confirmed by provider', created_at: '2026-09-07T12:00:00Z' }] });
  await fireEvent.press(screen.getByRole('button', { name: 'בדיקת מצב התשלום' }));
  expect(await screen.findByText('התשלום התקבל בהצלחה')).toBeOnTheScreen();
  expect(confirmer.confirm).toHaveBeenCalledTimes(2);
  await fireEvent.press(screen.getByRole('button', { name: 'חזרה' }));
  expect(router.back).toHaveBeenCalled();
});

it('never mistakes cancellation or missing allowed_actions for payment success', async () => {
  globalThis.fetch = jest.fn(async () => response(request({ state: 'cancelled', allowed_actions: [] })));
  const confirmer = { confirm: jest.fn() };
  await renderService(<ServicePaymentContent requestId="request-1" sessionScope="s" kind="diagnostic" confirmer={confirmer} />);
  expect(await screen.findByText('התשלום אינו זמין לבקשה זו')).toBeOnTheScreen();
  expect(screen.queryByText('התשלום התקבל בהצלחה')).toBeNull();
  expect(confirmer.confirm).not.toHaveBeenCalled();
});

it('polls delayed server confirmation without presenting Stripe again', async () => {
  jest.useFakeTimers();
  try {
    let current = request();
    globalThis.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST' ? response({ payment_id: 'p', client_secret: 's', state: 'pending' }) : response(current));
    const confirmer = { confirm: jest.fn().mockResolvedValue({ status: 'submitted' }) };
    await renderService(<ServicePaymentContent requestId="request-1" sessionScope="s" kind="diagnostic" confirmer={confirmer} />);
    await screen.findByText('ממתינים לאישור התשלום מהשרת');
    current = request({ state: 'awaiting_admin_review', allowed_actions: [], history: [{ from_state: 'awaiting_diagnostic_payment', to_state: 'awaiting_admin_review', source: 'system', reason: null, created_at: '2026-09-07T12:00:00Z' }] });
    await act(async () => { await jest.advanceTimersByTimeAsync(5000); });
    await waitFor(() => expect(screen.getByText('התשלום התקבל בהצלחה')).toBeOnTheScreen());
    expect(confirmer.confirm).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});

it('reconciles a lost Stripe result using server history instead of reporting a false failure', async () => {
  let current = request();
  globalThis.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST' ? response({ payment_id: 'p', state: 'pending', client_secret: 's' }) : response(current));
  const confirmer = { confirm: jest.fn(async () => {
    current = request({ state: 'awaiting_admin_review', allowed_actions: [], history: [{ from_state: 'awaiting_diagnostic_payment', to_state: 'awaiting_admin_review', source: 'system', reason: null, created_at: '2026-09-07T12:00:00Z' }] });
    throw new Error('lost response');
  }) };
  await renderService(<ServicePaymentContent requestId="request-1" sessionScope="s" kind="diagnostic" confirmer={confirmer} />);
  expect(await screen.findByText('התשלום התקבל בהצלחה')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'ניסיון נוסף' })).toBeNull();
});
