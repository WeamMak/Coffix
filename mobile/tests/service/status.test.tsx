import { screen } from '@testing-library/react-native';
import { ServiceDetailContent } from '../../app/(tabs)/(service)/requests/[requestId]';
import { ServiceConfirmationContent } from '../../app/(tabs)/(service)/request/confirmation';
import type { ServiceRequest } from '../../src/features/service/api';
import { renderService, request, response } from './helpers';
jest.mock('@stripe/stripe-react-native', () => ({ StripeProvider: ({ children }: { children: unknown }) => children, useStripe: () => ({}) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: jest.fn(), useFocusEffect: jest.fn() }));

const states: [ServiceRequest['state'], string][] = [
  ['awaiting_diagnostic_payment', 'ממתין לתשלום אבחון'], ['awaiting_admin_review', 'ממתין לבדיקת הצוות'],
  ['scheduled', 'תור מאושר'], ['received', 'המכונה התקבלה'], ['diagnosing', 'באבחון'],
  ['awaiting_additional_decision', 'ממתין להחלטתכם'], ['awaiting_additional_payment', 'ממתין לתשלום נוסף'],
  ['repair_in_progress', 'בתיקון'], ['ready_for_return', 'מוכן להחזרה'], ['completed', 'הושלם'], ['cancelled', 'בוטל'],
];
it.each(states)('renders server timeline state %s without inventing future milestones', async (state, label) => {
  globalThis.fetch = jest.fn(async () => response(request({ state, allowed_actions: [], history: [{ from_state: null, to_state: state, reason: null, source: 'system', created_at: '2026-09-07T10:00:00Z' }] })));
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="s" confirmer={{ confirm: jest.fn() }} />);
  await screen.findByText('SR-1001');
  expect(screen.getAllByTestId('timeline-label')).toHaveLength(1);
  expect(screen.getByTestId('timeline-label')).toHaveTextContent(label);
});
it('shows confirmed appointment only from admin-provided timestamps', async () => {
  globalThis.fetch = jest.fn(async () => response(request({ state: 'scheduled', allowed_actions: [], confirmed_appointment_start: '2026-09-12T08:00:00Z', confirmed_appointment_end: '2026-09-12T10:00:00Z' })));
  await renderService(<ServiceDetailContent requestId="request-1" sessionScope="s" confirmer={{ confirm: jest.fn() }} />);
  expect(await screen.findByText('תור מאושר על ידי הצוות')).toBeOnTheScreen();
  expect(screen.getByText('מועד מועדף — בקשה בלבד')).toBeOnTheScreen();
});
it('confirmation shows the server fee snapshot before the customer pays', async () => {
  globalThis.fetch = jest.fn(async () => response(request({ diagnostic_fee_agorot: 15000 })));
  await renderService(<ServiceConfirmationContent requestId="request-1" sessionScope="s" />);
  expect(await screen.findByText('דמי האבחון שנקבעו: ₪150')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'לפרטי הבקשה ולתשלום' })).toBeOnTheScreen();
});
