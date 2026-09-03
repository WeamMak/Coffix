import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  createContext,
  createElement,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cartApi, type Checkout, type CheckoutInput, type Order } from '../cart/api';
import { cartKeys, isVerifiedOrder, useOrder } from '../cart/queries';
import { fakePaymentConfirmer } from './fake';
import { createStripePaymentConfirmer } from './stripe';

export type PaymentMode = 'fake' | 'stripe';

export type PaymentClientResult =
  | { status: 'submitted' }
  | { status: 'declined'; message: string }
  | { status: 'unknown'; message: string };

export type PaymentConfirmer = {
  confirm(clientSecret: string): Promise<PaymentClientResult>;
};

export type CheckoutPaymentStatus =
  | 'declined'
  | 'expired'
  | 'failed'
  | 'idle'
  | 'processing'
  | 'submitting'
  | 'unknown'
  | 'verified';

type UsePaymentOptions = {
  confirmer: PaymentConfirmer;
  createIdempotencyKey?: () => string;
  pollIntervalMs?: number;
  sessionScope: string;
};

let checkoutKeySequence = 0;

function defaultIdempotencyKey(): string {
  checkoutKeySequence += 1;
  return `mobile-checkout-${Date.now()}-${checkoutKeySequence}`;
}

const PaymentContext = createContext<PaymentConfirmer>(fakePaymentConfirmer);

export function paymentMode(value = process.env.EXPO_PUBLIC_PAYMENT_PROVIDER): PaymentMode {
  return value === 'stripe' ? 'stripe' : 'fake';
}

function StripePaymentContextProvider({ children }: PropsWithChildren) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const confirmer = useMemo(
    () => createStripePaymentConfirmer({ initPaymentSheet, presentPaymentSheet }),
    [initPaymentSheet, presentPaymentSheet],
  );
  return createElement(PaymentContext.Provider, { value: confirmer }, children);
}

export function PaymentRuntimeProvider({ children }: PropsWithChildren) {
  if (paymentMode() === 'fake') {
    return createElement(PaymentContext.Provider, { value: fakePaymentConfirmer }, children);
  }

  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey || publishableKey === 'pk_test_replace_me') {
    throw new Error('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is required in stripe mode');
  }

  return createElement(
    StripeProvider,
    {
      children: createElement(StripePaymentContextProvider, undefined, children),
      publishableKey,
      urlScheme: 'coffix',
    },
  );
}

export function usePaymentConfirmer(): PaymentConfirmer {
  return useContext(PaymentContext);
}

export function usePayment({
  confirmer,
  createIdempotencyKey = defaultIdempotencyKey,
  pollIntervalMs = 2_000,
  sessionScope,
}: UsePaymentOptions) {
  const queryClient = useQueryClient();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  const [status, setStatus] = useState<CheckoutPaymentStatus>('idle');
  const inputRef = useRef<CheckoutInput | null>(null);
  const keyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const orderQuery = useOrder(
    sessionScope,
    orderId,
    Boolean(orderId),
    pollIntervalMs,
  );
  const order = orderQuery.data ?? checkout?.order;

  useEffect(() => {
    if (isVerifiedOrder(orderQuery.data)) {
      setStatus('verified');
      setMessage('');
    } else if (orderQuery.data?.state === 'payment_expired') {
      setStatus('expired');
      setMessage('חלון התשלום הסתיים. יש לחזור לסל ולהתחיל מחדש.');
    } else if (orderQuery.data?.state === 'cancelled') {
      setStatus('failed');
      setMessage('ההזמנה בוטלה ולא בוצע חיוב.');
    }
  }, [orderQuery.data]);

  const execute = useCallback(async (input: CheckoutInput) => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    inputRef.current = input;
    keyRef.current ??= createIdempotencyKey();
    setMessage('');
    setStatus('submitting');
    try {
      const result = await cartApi.checkout(input, keyRef.current);
      setCheckout(result);
      setOrderId(result.order.id);
      queryClient.setQueryData(
        cartKeys.order(sessionScope, result.order.id),
        result.order,
      );
      void queryClient.invalidateQueries({ queryKey: cartKeys.cart(sessionScope) });

      const clientResult = await confirmer.confirm(result.payment.client_secret);
      if (clientResult.status === 'submitted') {
        setStatus('processing');
        setMessage('התשלום נשלח. ממתינים לאישור מאובטח.');
      } else {
        setStatus(clientResult.status);
        setMessage(clientResult.message);
      }
    } catch {
      setStatus('unknown');
      setMessage('לא הצלחנו לוודא את מצב התשלום. נבדוק את ההזמנה לפני ניסיון נוסף.');
    } finally {
      inFlightRef.current = false;
    }
  }, [confirmer, createIdempotencyKey, queryClient, sessionScope]);

  return {
    checkout,
    isSubmitting: status === 'submitting',
    message,
    order,
    retry: () => inputRef.current ? execute(inputRef.current) : Promise.resolve(),
    start: execute,
    status,
  };
}
