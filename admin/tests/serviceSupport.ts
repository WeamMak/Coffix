import type { components } from '@coffix/api-client';
type Schema = components['schemas'];
export const staffUser: Schema['AdminUserRead'] = { id: 'tech-1', display_name: 'Dana', phone_e164: '+972500000002', role: 'technician', is_active: true, created_at: '2026-09-08T10:00:00Z', updated_at: '2026-09-08T10:00:00Z' };
export const service: Schema['StaffServiceRequestRead'] = {
  id: 'service-1', reference: 'SVC-27001', machine_id: 'machine-1', service_type_id: 'type-1', service_type_label_he: 'תיקון', state: 'awaiting_intake_review',
  diagnostic_base_fee_agorot: null, diagnostic_fee_agorot: null, urgency_id: 'urgent', urgency_name_he: 'דחוף', urgency_description_he: 'בהקדם', urgency_surcharge_percent: 30, response_hours: 4,
  currency: 'ILS', description: 'Machine leaks while brewing.', location_mode: 'bring_in', address_snapshot: { street: 'Coffee', building: '27', city: 'Tel Aviv', country: 'IL' },
  preferred_window_start: '2026-09-10T06:00:00Z', preferred_window_end: '2026-09-10T08:00:00Z', confirmed_appointment_start: null, confirmed_appointment_end: null,
  assigned_technician_id: null, assigned_technician: null, reviewed_by: null, history: [], notes: [], media: [], quotes: [], allowed_actions: ['set_diagnostic_fee', 'cancel'],
  created_at: '2026-09-08T10:00:00Z', updated_at: '2026-09-08T10:00:00Z',
  customer: { id: 'customer-1', display_name: 'Customer One', phone_e164: '+972500000003' }, machine: { manufacturer: 'Coffix', model_name: 'Classic', serial_number: 'SERIAL-27' },
};
