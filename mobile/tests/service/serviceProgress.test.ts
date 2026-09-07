import { serviceProgressSteps } from '../../src/features/service/serviceProgress';
import { request } from './helpers';

it('changes only the collection label for the location selected by the customer', () => {
  const pickup = serviceProgressSteps(request({ location_mode: 'pickup' }));
  const bringIn = serviceProgressSteps(request({ location_mode: 'bring_in' }));
  expect(pickup).toHaveLength(6);
  expect(pickup[3]?.label).toBe('איסוף');
  expect(bringIn[3]?.label).toBe('הבאה לחנות');
  expect(pickup.filter((_, index) => index !== 3)).toEqual(bringIn.filter((_, index) => index !== 3));
});

it.each(['awaiting_diagnostic_payment', 'awaiting_additional_decision', 'awaiting_additional_payment'] as const)('keeps the full flow and records rejection under payment after cancelling %s', from_state => {
  const timestamp = '2026-09-07T14:22:00+03:00';
  const steps = serviceProgressSteps(request({ state: 'cancelled', allowed_actions: [], history: [{ from_state, to_state: 'cancelled', source: 'customer', reason: 'rejected payment', created_at: timestamp }] }));
  expect(steps).toHaveLength(6);
  expect(steps[2]).toMatchObject({ label: 'ממתין לתשלום', phase: 'rejected', detail: 'נדחה', timestamp });
  expect(steps[5]).toMatchObject({ phase: 'future', timestamp: null });
});

it('shows actual staff for each later milestone and no staff on submission', () => {
  const data = request({ state: 'completed', assigned_technician: { display_name: 'Assigned technician', phone_e164: '+972501234567' }, history: [
    { from_state: null, to_state: 'awaiting_intake_review', source: 'customer', staff_name: null, reason: null, created_at: '2026-09-07T09:00:00Z' },
    { from_state: 'awaiting_intake_review', to_state: 'awaiting_diagnostic_payment', source: 'admin', staff_name: 'Fee reviewer', reason: null, created_at: '2026-09-07T10:00:00Z' },
    { from_state: 'scheduled', to_state: 'received', source: 'technician', staff_name: 'Receiving technician', reason: null, created_at: '2026-09-07T11:00:00Z' },
    { from_state: 'repair_in_progress', to_state: 'ready_for_return', source: 'technician', staff_name: 'Repair technician', reason: null, created_at: '2026-09-07T12:00:00Z' },
    { from_state: 'ready_for_return', to_state: 'completed', source: 'technician', staff_name: 'Return technician', reason: null, created_at: '2026-09-07T13:00:00Z' },
  ] });
  expect(serviceProgressSteps(data).map(step => step.staffName)).toEqual([undefined, 'Fee reviewer', 'Fee reviewer', 'Receiving technician', 'Repair technician', 'Return technician']);
  expect(serviceProgressSteps(request()).slice(1).map(step => step.staffName)).toEqual(Array(5).fill('טרם שויך טכנאי'));
});
