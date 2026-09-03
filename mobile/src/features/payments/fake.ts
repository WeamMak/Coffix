import type { PaymentConfirmer } from './usePayment';
import { apiClient } from '../../api/client';

export const fakePaymentConfirmer: PaymentConfirmer = {
  async confirm(payment) {
    await apiClient.request('/api/v1/test/payments/webhooks', {
      body: {
        event_id: `mobile-${payment.provider_payment_id}-confirmed`,
        event_type: 'payment_intent.succeeded',
        provider_object_id: payment.provider_payment_id,
        state: 'confirmed',
      },
      method: 'POST',
    });
    return { status: 'submitted' };
  },
};
