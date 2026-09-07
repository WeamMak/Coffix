import type { components } from '@coffix/api-client';

import { apiClient } from '../../api/client';

export type ServiceRequest = components['schemas']['ServiceRequestRead'];
export type ServiceCreate = components['schemas']['ServiceRequestCreate'];
export type ServiceOptions = components['schemas']['ServiceIntakeOptionsRead'];
export type ServicePayment = components['schemas']['ServicePaymentIntentRead'];
export type PaymentKind = 'diagnostic' | 'additional';
const requestPath = (id: string) => `/api/v1/service-requests/${encodeURIComponent(id)}`;

export const serviceApi = {
  options(machineId: string): Promise<ServiceOptions> {
    return apiClient.request(`/api/v1/machines/${encodeURIComponent(machineId)}/service-options`);
  },
  list(): Promise<ServiceRequest[]> { return apiClient.request('/api/v1/service-requests'); },
  get(id: string): Promise<ServiceRequest> { return apiClient.request(requestPath(id)); },
  create(machineId: string, input: ServiceCreate): Promise<ServiceRequest> {
    return apiClient.request(`/api/v1/machines/${encodeURIComponent(machineId)}/service-requests`, { body: input, method: 'POST' });
  },
  cancel(id: string): Promise<ServiceRequest> {
    return apiClient.request(`${requestPath(id)}/cancel`, { method: 'POST' });
  },
  decide(id: string, decision: 'accepted' | 'declined'): Promise<ServiceRequest> {
    return apiClient.request(`${requestPath(id)}/quote-decision`, { body: { decision }, method: 'POST' });
  },
  payment(id: string, kind: PaymentKind, key: string): Promise<ServicePayment> {
    return apiClient.request(`${requestPath(id)}/${kind}-payment`, { headers: { 'Idempotency-Key': key }, method: 'POST' });
  },
};
