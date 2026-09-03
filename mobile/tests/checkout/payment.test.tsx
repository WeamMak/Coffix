import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PaymentContent } from '../../app/(tabs)/(shop)/payment';
import { fakePaymentConfirmer } from '../../src/features/payments/fake';
import { createStripePaymentConfirmer } from '../../src/features/payments/stripe';
import {
  type PaymentConfirmer,
  usePayment,
} from '../../src/features/payments/usePayment';

jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({ children }: { children: unknown }) => children,
  useStripe: () => ({
    initPaymentSheet: jest.fn(),
    presentPaymentSheet: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({
    addressId: 'address-1',
    checkoutKey: 'checkout-fixed',
  })),
}));

const pendingOrder = {
  address: {
    apartment: null,
    building: '12',
    city: 'תל אביב',
    country: 'IL' as const,
    phone_e164: '+972501234567',
    postal_code: null,
    recipient_name: 'מאיה כהן',
    street: 'דיזנגוף',
  },
  allowed_actions: [],
  created_at: '2026-09-03T10:00:00Z',
  currency: 'ILS' as const,
  history: [],
  id: 'order-1',
  items: [],
  order_number: 'CFX-1001',
  payment_deadline: '2026-09-03T10:30:00Z',
  shipment: null,
  shipping_agorot: 2900,
  state: 'pending_payment' as const,
  subtotal_agorot: 7250,
  total_agorot: 10150,
};

const checkout = {
  order: pendingOrder,
  payment: {
    client_secret: 'fake_pi_secret',
    payment_id: 'payment-1',
    provider_payment_id: 'fake_pi_1',
    state: 'pending' as const,
  },
};

function response(payload: unknown, status = 200): Response {
  return {
    headers: new Headers(),
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function PaymentHarness({ confirmer }: { confirmer: PaymentConfirmer }) {
  const payment = usePayment({
    checkout,
    confirmer,
    pollIntervalMs: 10,
    sessionScope: 'session-1',
  });
  return (
    <View>
      <Text>{payment.status}</Text>
      <Pressable
        accessibilityLabel="תשלום"
        accessibilityRole="button"
        disabled={payment.isSubmitting}
        onPress={() => void payment.start()}
      />
    </View>
  );
}

async function renderPayment(confirmer: PaymentConfirmer) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  await render(
    <QueryClientProvider client={client}>
      <PaymentHarness confirmer={confirmer} />
    </QueryClientProvider>,
  );
}

async function renderPaymentScreen(confirmer: PaymentConfirmer, pollIntervalMs?: number) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  await render(
    <SafeAreaProvider initialMetrics={{
      frame: { height: 844, width: 390, x: 0, y: 0 },
      insets: { bottom: 34, left: 0, right: 0, top: 44 },
    }}>
      <QueryClientProvider client={client}>
        <PaymentContent
          addressId="address-1"
          checkoutKey="checkout-fixed"
          confirmer={confirmer}
          pollIntervalMs={pollIntervalMs}
          sessionScope="session-1"
        />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('payment confirmation adapters', () => {
  it('submits fake payments without invoking a native SDK', async () => {
    await expect(fakePaymentConfirmer.confirm('fake_pi_secret')).resolves.toEqual({
      status: 'submitted',
    });
  });

  it('initializes and presents Stripe PaymentSheet for the server intent', async () => {
    const initPaymentSheet = jest.fn().mockResolvedValue({});
    const presentPaymentSheet = jest.fn().mockResolvedValue({});
    const confirmer = createStripePaymentConfirmer({
      initPaymentSheet,
      presentPaymentSheet,
    });

    await expect(confirmer.confirm('pi_secret')).resolves.toEqual({
      status: 'submitted',
    });
    expect(initPaymentSheet).toHaveBeenCalledWith({
      merchantDisplayName: 'Coffix',
      paymentIntentClientSecret: 'pi_secret',
      returnURL: 'coffix://stripe-redirect',
    });
    expect(presentPaymentSheet).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Canceled', 'התשלום בוטל. אפשר לנסות שוב.'],
    ['Failed', 'התשלום נדחה. בדקו את הפרטים ונסו שוב.'],
  ])('maps Stripe %s outcomes to a known decline', async (code, message) => {
    const confirmer = createStripePaymentConfirmer({
      initPaymentSheet: jest.fn().mockResolvedValue({}),
      presentPaymentSheet: jest.fn().mockResolvedValue({
        error: { code, message: 'provider detail' },
      }),
    });

    await expect(confirmer.confirm('pi_secret')).resolves.toEqual({
      message,
      status: 'declined',
    });
  });

  it('keeps unclassified Stripe outcomes unknown', async () => {
    const confirmer = createStripePaymentConfirmer({
      initPaymentSheet: jest.fn().mockResolvedValue({}),
      presentPaymentSheet: jest.fn().mockRejectedValue(new Error('network lost')),
    });

    await expect(confirmer.confirm('pi_secret')).resolves.toEqual({
      message: 'לא הצלחנו לוודא את מצב התשלום. נבדוק את ההזמנה לפני ניסיון נוסף.',
      status: 'unknown',
    });
  });
});

describe('server-authoritative checkout payment', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows server shipping and total before starting payment', async () => {
    globalThis.fetch = jest.fn().mockImplementation((_request: string, init?: RequestInit) => (
      init?.method === 'POST'
        ? Promise.resolve(response(checkout, 201))
        : new Promise<Response>(() => undefined)
    ));
    const confirmer: PaymentConfirmer = {
      confirm: jest.fn().mockResolvedValue({ status: 'submitted' }),
    };

    await renderPaymentScreen(confirmer);

    expect(await screen.findByText('₪29')).toBeOnTheScreen();
    expect(screen.getAllByText('₪101.50')).toHaveLength(2);
    expect(confirmer.confirm).not.toHaveBeenCalled();
  });

  it('navigates to confirmation only after Pay becomes server verified', async () => {
    let paid = false;
    globalThis.fetch = jest.fn().mockImplementation((_request: string, init?: RequestInit) => (
      init?.method === 'POST'
        ? Promise.resolve(response(checkout, 201))
        : Promise.resolve(response({ ...pendingOrder, state: paid ? 'paid' : 'pending_payment' }))
    ));
    const confirmer: PaymentConfirmer = {
      confirm: jest.fn().mockImplementation(async () => {
        paid = true;
        return { status: 'submitted' as const };
      }),
    };
    await renderPaymentScreen(confirmer, 10);
    await screen.findByText('₪29');
    expect(router.replace).not.toHaveBeenCalledWith(expect.objectContaining({
      pathname: '/(tabs)/(shop)/confirmation',
    }));

    await fireEvent.press(screen.getByRole('button', { name: 'תשלום מאובטח' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({
      params: { orderId: 'order-1' },
      pathname: '/(tabs)/(shop)/confirmation',
    }));
    expect(confirmer.confirm).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate confirmation and verifies only after the order becomes paid', async () => {
    const confirmationRequest = deferred<{ status: 'submitted' }>();
    const orderRequest = deferred<Response>();
    globalThis.fetch = jest.fn().mockImplementation((request: string) => {
      if (request.includes('/orders/order-1')) {
        return orderRequest.promise;
      }
      return Promise.resolve(response({}));
    });
    const confirmer: PaymentConfirmer = {
      confirm: jest.fn().mockReturnValue(confirmationRequest.promise),
    };
    await renderPayment(confirmer);

    await fireEvent.press(screen.getByRole('button', { name: 'תשלום' }));
    await fireEvent.press(screen.getByRole('button', { name: 'תשלום' }));
    await waitFor(() => expect(confirmer.confirm).toHaveBeenCalledTimes(1));

    confirmationRequest.resolve({ status: 'submitted' });
    expect(await screen.findByText('processing')).toBeOnTheScreen();
    expect(screen.queryByText('verified')).not.toBeOnTheScreen();
    orderRequest.resolve(response({ ...pendingOrder, state: 'paid' }));
    await waitFor(() => expect(screen.getByText('verified')).toBeOnTheScreen());

    expect(confirmer.confirm).toHaveBeenCalledWith('fake_pi_secret');
  });

  it.each([
    [{ status: 'declined', message: 'הכרטיס נדחה.' }, 'declined'],
    [{ status: 'unknown', message: 'מצב התשלום לא ידוע.' }, 'unknown'],
  ] as const)('renders %s without claiming success', async (clientResult, expected) => {
    globalThis.fetch = jest.fn().mockImplementation(() => new Promise<Response>(() => undefined));
    await renderPayment({ confirm: jest.fn().mockResolvedValue(clientResult) });

    await fireEvent.press(screen.getByRole('button', { name: 'תשלום' }));
    expect(await screen.findByText(expected)).toBeOnTheScreen();
    expect(screen.queryByText('verified')).not.toBeOnTheScreen();
  });
});
