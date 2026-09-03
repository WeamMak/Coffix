import type { PaymentClientResult, PaymentConfirmer } from './usePayment';

type PaymentSheetError = {
  code?: string;
};

export type StripePaymentSheet = {
  initPaymentSheet(options: {
    merchantDisplayName: string;
    paymentIntentClientSecret: string;
    returnURL: string;
  }): Promise<{ error?: PaymentSheetError }>;
  presentPaymentSheet(): Promise<{ error?: PaymentSheetError }>;
};

const UNKNOWN_MESSAGE =
  'לא הצלחנו לוודא את מצב התשלום. נבדוק את ההזמנה לפני ניסיון נוסף.';

function decline(code: string): PaymentClientResult {
  return {
    message: code === 'Canceled'
      ? 'התשלום בוטל. אפשר לנסות שוב.'
      : 'התשלום נדחה. בדקו את הפרטים ונסו שוב.',
    status: 'declined',
  };
}

export function createStripePaymentConfirmer(
  paymentSheet: StripePaymentSheet,
): PaymentConfirmer {
  return {
    async confirm(payment) {
      try {
        const initialized = await paymentSheet.initPaymentSheet({
          merchantDisplayName: 'Coffix',
          paymentIntentClientSecret: payment.client_secret,
          returnURL: 'coffix://stripe-redirect',
        });
        if (initialized.error) {
          return initialized.error.code === 'Failed'
            ? decline('Failed')
            : { message: UNKNOWN_MESSAGE, status: 'unknown' };
        }

        const presented = await paymentSheet.presentPaymentSheet();
        if (!presented.error) {
          return { status: 'submitted' };
        }
        if (presented.error.code === 'Canceled' || presented.error.code === 'Failed') {
          return decline(presented.error.code);
        }
        return { message: UNKNOWN_MESSAGE, status: 'unknown' };
      } catch {
        return { message: UNKNOWN_MESSAGE, status: 'unknown' };
      }
    },
  };
}
