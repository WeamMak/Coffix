import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

import { cartApi, type Checkout } from '../cart/api';
import { cartKeys, isVerifiedOrder, useOrder } from '../cart/queries';
import { fakePaymentConfirmer } from './fake';
import { createStripePaymentConfirmer } from './stripe';

export type PaymentMode = 'fake' | 'stripe';

export type PaymentClientResult =
  | { status: 'submitted' }
  | { status: 'declined'; message: string }
  | { status: 'unknown'; message: string };

export type PaymentConfirmer = {
  confirm(payment: Checkout['payment']): Promise<PaymentClientResult>;
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

type PreparedCheckoutOptions = {
  addressId: string;
  checkoutKey: string;
  sessionScope: string;
};

type UsePaymentOptions = {
  checkout: Checkout | undefined;
  confirmer: PaymentConfirmer;
  orderId: string;
  pollIntervalMs?: number;
  sessionScope: string;
};

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

export function usePreparedCheckout({
  addressId,
  checkoutKey,
  sessionScope,
}: PreparedCheckoutOptions) {
  const queryClient = useQueryClient();
  return useQuery({
    enabled: Boolean(addressId && checkoutKey && sessionScope),
    queryFn: async () => {
      const checkout = await cartApi.checkout({ address_id: addressId }, checkoutKey);
      queryClient.setQueryData(
        cartKeys.order(sessionScope, checkout.order.id),
        checkout.order,
      );
      return checkout;
    },
    queryKey: cartKeys.checkout(sessionScope, checkoutKey),
    retry: false,
    staleTime: Infinity,
  });
}

export function usePayment({
  checkout,
  confirmer,
  orderId,
  pollIntervalMs = 2_000,
  sessionScope,
}: UsePaymentOptions) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<CheckoutPaymentStatus>('idle');
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
      void queryClient.invalidateQueries({ queryKey: cartKeys.cart(sessionScope) });
    } else if (orderQuery.data?.state === 'payment_expired') {
      setStatus('expired');
      setMessage('חלון התשלום הסתיים. יש לחזור לסל ולהתחיל מחדש.');
    } else if (orderQuery.data?.state === 'cancelled') {
      setStatus('failed');
      setMessage('ההזמנה בוטלה ולא בוצע חיוב.');
    }
  }, [orderQuery.data, queryClient, sessionScope]);

  const execute = useCallback(async () => {
    if (!checkout || inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setMessage('');
    setStatus('submitting');
    try {
      const clientResult = await confirmer.confirm(checkout.payment);
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
  }, [checkout, confirmer]);

  return {
    checkout,
    isSubmitting: status === 'submitting',
    message,
    order,
    orderIsError: orderQuery.isError,
    refetchOrder: orderQuery.refetch,
    retry: execute,
    start: execute,
    status,
  };
}
