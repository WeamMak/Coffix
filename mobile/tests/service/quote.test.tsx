jest.mock('@stripe/stripe-react-native', () => ({ StripeProvider: ({ children }: { children: unknown }) => children, useStripe: () => ({ initPaymentSheet: jest.fn(), presentPaymentSheet: jest.fn() }) }));
import { fireEvent, screen } from '@testing-library/react-native';
import { ServiceDetailContent } from '../../app/(tabs)/(service)/requests/[requestId]';
import { renderService, request, response } from './helpers';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: jest.fn(), useFocusEffect: jest.fn() }));

it.each(['accepted', 'declined'] as const)('requires explicit confirmation before a quote is %s', async decision => {
  let current = request({ state: 'awaiting_additional_decision', allowed_actions: ['accept_quote', 'decline_quote'], quotes: [{ id: 'quote-1', amount_agorot: 35000, currency: 'ILS', explanation: 'החלפת משאבה', decision: 'pending', decided_at: null, created_at: '2026-09-07T11:00:00Z' }] });
  const fetcher = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/quote-decision')) {
      const body = JSON.parse(String(init?.body));
      current = { ...current, state: body.decision === 'accepted' ? 'awaiting_additional_payment' : 'cancelled', allowed_actions: body.decision === 'accepted' ? ['pay_additional'] : [], quotes: current.quotes.map(q => ({ ...q, decision: body.decision })) };
    }
    return response(current);
  });
  globalThis.fetch = fetcher;
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="s" confirmer={{ confirm: jest.fn() }} />);
  expect(await screen.findByText('החלפת משאבה')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: decision === 'accepted' ? 'אישור הצעת מחיר' : 'דחיית הצעת מחיר' }));
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/quote-decision'))).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: decision === 'accepted' ? 'אישור קבלה ותשלום בהמשך' : 'אישור דחייה וביטול הבקשה' }));
  expect(await screen.findByText(decision === 'accepted' ? 'ממתין לתשלום נוסף' : 'בוטל')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'תשלום דמי אבחון' })).toBeNull();
  if (decision === 'accepted') expect(screen.getByRole('button', { name: 'תשלום נוסף' })).toBeOnTheScreen();
  else expect(screen.queryByRole('button', { name: 'תשלום נוסף' })).toBeNull();
});

it('uses a separate additional-payment key and waits for server confirmation before repair', async () => {
  let current = request({ state: 'awaiting_additional_payment', allowed_actions: ['pay_additional'] });
  const fetcher = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
    ? response({ payment_id: 'additional-1', provider_payment_id: 'fake-additional', client_secret: 'secret', state: 'pending' }) : response(current));
  globalThis.fetch = fetcher;
  const confirmer = { confirm: jest.fn(async () => {
    current = request({ state: 'repair_in_progress', allowed_actions: [] });
    return { status: 'submitted' as const };
  }) };
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="s" confirmer={confirmer} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'תשלום נוסף' }));
  expect(await screen.findByText('בתיקון')).toBeOnTheScreen();
  expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/\/additional-payment$/), expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': 'mobile-service-request-1-additional' }) }));
});
