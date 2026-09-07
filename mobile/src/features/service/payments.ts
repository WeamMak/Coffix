import type { PaymentConfirmer } from '../payments/usePayment';
import { serviceApi, type PaymentKind, type ServiceRequest } from './api';

export function servicePaymentKey(requestId: string, kind: PaymentKind): string {
  return `mobile-service-${requestId}-${kind}`;
}

export async function payForService(requestId: string, kind: PaymentKind, confirmer: PaymentConfirmer): Promise<{ request: ServiceRequest; message: string }> {
  const action = kind === 'diagnostic' ? 'pay_diagnostic' : 'pay_additional';
  const current = await serviceApi.get(requestId);
  if (!current.allowed_actions.includes(action)) return { request: current, message: '' };
  let message = 'התשלום נשלח. ממתינים לאישור מאובטח.';
  try {
    const payment = await serviceApi.payment(requestId, kind, servicePaymentKey(requestId, kind));
    if (payment.state === 'failed') message = 'התשלום נכשל. יש לפנות לצוות לבירור.';
    else if (payment.state !== 'confirmed') {
      const result = await confirmer.confirm(payment);
      if (result.status === 'declined') message = result.message;
      if (result.status === 'unknown') message = 'מצב התשלום עדיין לא ידוע. בודקים את הבקשה מול השרת.';
    }
  } catch {
    message = 'מצב התשלום עדיין לא ידוע. בודקים את הבקשה מול השרת.';
  }
  const updated = await serviceApi.get(requestId);
  return { request: updated, message: updated.allowed_actions.includes(action) ? message : '' };
}
