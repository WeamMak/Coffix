import type { PaymentConfirmer } from './usePayment';

export const fakePaymentConfirmer: PaymentConfirmer = {
  async confirm() {
    return { status: 'submitted' };
  },
};
