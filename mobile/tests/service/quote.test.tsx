import { router } from 'expo-router';
jest.mock('@stripe/stripe-react-native', () => ({ StripeProvider: ({ children }: { children: unknown }) => children, useStripe: () => ({ initPaymentSheet: jest.fn(), presentPaymentSheet: jest.fn() }) }));
import { fireEvent, screen } from '@testing-library/react-native';
import { ServiceDetailContent } from '../../app/(tabs)/(service)/requests/[requestId]';
import { renderService, request, response } from './helpers';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() }, useLocalSearchParams: jest.fn(), useFocusEffect: jest.fn() }));

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
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="s" />);
  expect(await screen.findByText('החלפת משאבה')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: decision === 'accepted' ? 'אישור הצעת מחיר' : 'דחיית הצעת מחיר' }));
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/quote-decision'))).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: decision === 'accepted' ? 'אישור קבלה ותשלום בהמשך' : 'אישור דחייה וביטול הבקשה' }));
  expect(await screen.findByText(decision === 'accepted' ? 'ממתין לתשלום נוסף' : 'בוטל')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'תשלום דמי אבחון' })).toBeNull();
  if (decision === 'accepted') expect(screen.getByRole('button', { name: 'תשלום נוסף' })).toBeOnTheScreen();
  else expect(screen.queryByRole('button', { name: 'תשלום נוסף' })).toBeNull();
});

it('opens the separate payment page for an accepted additional quote', async () => {
  globalThis.fetch = jest.fn(async () => response(request({ state: 'awaiting_additional_payment', allowed_actions: ['pay_additional'], quotes: [{ id: 'quote-1', amount_agorot: 35000, currency: 'ILS', explanation: 'החלפת משאבה', decision: 'accepted', decided_at: null, created_at: '2026-09-07T11:00:00Z' }] })));
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="s" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'תשלום נוסף' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/(tabs)/(service)/requests/[requestId]/payment', params: { requestId: 'request-1', kind: 'additional' } });
});

it('does not tell a completed request with an accepted quote to wait for payment', async () => {
  globalThis.fetch = jest.fn(async () => response(request({ state: 'completed', allowed_actions: [], quotes: [{ id: 'quote-1', amount_agorot: 35000, currency: 'ILS', explanation: 'החלפת משאבה', decision: 'accepted', decided_at: null, created_at: '2026-09-07T11:00:00Z' }] })));
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="s" />);
  expect(await screen.findByText('ההצעה אושרה.')).toBeOnTheScreen();
  expect(screen.queryByTestId('service-payment-card')).toBeNull();
  expect(screen.queryByText('ההצעה אושרה. התיקון ימשיך רק לאחר אישור התשלום הנוסף.')).toBeNull();
});
