import type { PaymentConfirmer } from '../payments/usePayment';
import { serviceApi, type PaymentKind, type ServiceRequest } from './api';

export function servicePaymentKey(requestId: string, kind: PaymentKind): string {
  return `mobile-service-${requestId}-${kind}`;
}

export function hasVerifiedServicePayment(request: ServiceRequest, kind: PaymentKind): boolean {
  // These transitions are reserved for verified provider events on the server.
  return request.history.some(entry => entry.source === 'system' && (
    kind === 'diagnostic'
      ? entry.from_state === 'awaiting_diagnostic_payment' && entry.to_state === 'awaiting_admin_review'
      : entry.from_state === 'awaiting_additional_payment' && entry.to_state === 'repair_in_progress'
  ));
}

export type ServicePaymentResult = {
  request: ServiceRequest;
  status: 'verified' | 'pending' | 'retry' | 'unavailable';
  message: string;
};

export async function payForService(requestId: string, kind: PaymentKind, confirmer: PaymentConfirmer): Promise<ServicePaymentResult> {
  const action = kind === 'diagnostic' ? 'pay_diagnostic' : 'pay_additional';
  const current = await serviceApi.get(requestId);
  if (hasVerifiedServicePayment(current, kind)) return { request: current, status: 'verified', message: '' };
  if (!current.allowed_actions.includes(action)) return { request: current, status: 'unavailable', message: '' };
  let status: ServicePaymentResult['status'] = 'pending';
  let message = 'התשלום נשלח. ממתינים לאישור מאובטח.';
  try {
    const payment = await serviceApi.payment(requestId, kind, servicePaymentKey(requestId, kind));
    // A failed attempt can be confirmed again on the same Stripe intent.
    if (payment.state !== 'confirmed') {
      const result = await confirmer.confirm(payment);
      if (result.status !== 'submitted') {
        status = 'retry';
        message = result.status === 'declined' ? result.message : 'מצב התשלום עדיין לא ידוע. נבדוק מול השרת לפני ניסיון נוסף.';
      }
    }
  } catch {
    status = 'retry';
    message = 'מצב התשלום עדיין לא ידוע. נבדוק מול השרת לפני ניסיון נוסף.';
  }
  const updated = await serviceApi.get(requestId);
  if (hasVerifiedServicePayment(updated, kind)) return { request: updated, status: 'verified', message: '' };
  if (!updated.allowed_actions.includes(action)) return { request: updated, status: 'unavailable', message: '' };
  return { request: updated, status, message };
}
