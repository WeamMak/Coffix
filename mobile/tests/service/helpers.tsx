import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ServiceRequest } from '../../src/features/service/api';

export function request(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: 'request-1', reference: 'SR-1001', machine_id: 'machine-1', service_type_id: 'repair',
    service_type_label_he: 'תיקון', state: 'awaiting_diagnostic_payment', diagnostic_fee_agorot: 12500,
    currency: 'ILS', description: 'המכונה לא מתחממת', location_mode: 'bring_in',
    address_snapshot: { street: 'הרצל', building: '10', city: 'חיפה', country: 'IL' },
    preferred_window_start: '2026-09-10T08:00:00Z', preferred_window_end: '2026-09-10T10:00:00Z',
    confirmed_appointment_start: null, confirmed_appointment_end: null, assigned_technician_id: null,
    history: [{ from_state: null, to_state: 'awaiting_diagnostic_payment', source: 'customer', reason: null, created_at: '2026-09-07T10:00:00Z' }],
    notes: [], media: [], quotes: [], allowed_actions: ['cancel', 'pay_diagnostic'],
    created_at: '2026-09-07T10:00:00Z', updated_at: '2026-09-07T10:00:00Z', ...overrides,
  };
}
export function response(value: unknown, status = 200): Response {
  return { headers: new Headers(), ok: status < 400, status, text: async () => JSON.stringify(value) } as Response;
}
export async function renderService(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  await render(<SafeAreaProvider initialMetrics={{ frame: { width: 390, height: 844, x: 0, y: 0 }, insets: { top: 44, bottom: 34, left: 0, right: 0 } }}><QueryClientProvider client={client}>{children}</QueryClientProvider></SafeAreaProvider>);
  return client;
}
