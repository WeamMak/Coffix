import { expect, type APIRequestContext } from '@playwright/test';
import { api } from './users';
import { paymentEvent } from '../helpers/fakeProviders';
export async function intake(request: APIRequestContext, admin: string, customer: string) {
  const model = await api(request, admin, '/admin/machine-models', { manufacturer: 'E2E', model_name: 'Service machine' });
  const machine = await api(request, customer, '/machines', { machine_model_id: model.id, serial_number: 'E2E-MANUAL-001', purchase_date: '2025-01-01' });
  expect(machine).toMatchObject({ source: 'manual', warranty_status: 'none' });
  const type = await api(request, admin, '/admin/service-types', { label_he: 'תיקון בדיקה', label_en: 'Repair', diagnostic_fee_agorot: 10000, machine_model_ids: [model.id] });
  const service = await api(request, customer, `/machines/${machine.id}/service-requests`, { service_type_id: type.id, description: 'המכונה אינה מחממת את המים', location_mode: 'bring_in' });
  expect(service.state).toBe('awaiting_intake_review');
  return { model, machine, type, service };
}
export async function diagnose(request: APIRequestContext, admin: string, technician: string, customer: string, id: string) {
  await api(request, admin, `/admin/service-requests/${id}/diagnostic-fee`, { amount_agorot: 10000 });
  const payment = await api(request, customer, `/service-requests/${id}/diagnostic-payment`, undefined, 'POST', 'diagnostic-one');
  await paymentEvent(request, payment.provider_payment_id, 'diagnostic-one');
  const [tech] = await api(request, admin, '/admin/technicians');
  await api(request, admin, `/admin/service-requests/${id}/appointment`, { technician_id: tech.id, start: '2026-01-06T10:00:00Z', end: '2026-01-06T11:00:00Z' });
  await api(request, technician, `/technician/jobs/${id}/status`, { action: 'receive' });
  await api(request, technician, `/technician/jobs/${id}/status`, { action: 'start_diagnosis' });
  return payment;
}
