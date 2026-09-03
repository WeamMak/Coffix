import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PaymentContent } from '../../app/(tabs)/(shop)/payment';
import type { Cart, Checkout } from '../../src/features/cart/api';
import { fakePaymentConfirmer } from '../../src/features/payments/fake';
import { createStripePaymentConfirmer } from '../../src/features/payments/stripe';

jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({ children }: { children: unknown }) => children,
  useStripe: () => ({
    initPaymentSheet: jest.fn(),
    presentPaymentSheet: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({
    addressId: 'address-1',
    checkoutKey: 'checkout-fixed',
  })),
}));

const cart: Cart = {
  currency: 'ILS',
  expires_at: '2099-09-03T11:00:00Z',
  id: 'cart-1',
  items: [{
    attributes: { weight: '1kg' },
    image_alt_he: 'פולי קפה',
    image_url: 'https://images.example/beans.jpg',
    is_active: true,
    line_total_agorot: 7250,
    name_he: 'פולי קפה הבית',
    product_id: 'product-1',
    product_type: 'beans',
    quantity: 1,
    sku_code: 'HOME-1KG',
    sku_id: 'sku-1',
    stock_quantity: 4,
    unit_price_agorot: 7250,
  }],
  last_activity_at: '2026-09-03T10:00:00Z',
  shipping_agorot: 3000,
  status: 'active',
  subtotal_agorot: 7250,
  total_agorot: 10250,
  total_quantity: 1,
  version: 1,
};

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
  shipping_agorot: 3000,
  state: 'pending_payment' as const,
  subtotal_agorot: 7250,
  total_agorot: 10250,
};

const checkout: Checkout = {
  order: pendingOrder,
  payment: {
    client_secret: 'fake_pi_secret',
    payment_id: 'payment-1',
    provider_payment_id: 'fake_pi_1',
    state: 'pending',
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

async function renderPaymentScreen() {
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
          sessionScope="session-1"
        />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('payment confirmation adapters', () => {
  afterEach(() => jest.restoreAllMocks());

  it('submits fake payments through the local confirmation webhook', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response({ result: 'processed' }));

    await expect(fakePaymentConfirmer.confirm(checkout.payment)).resolves.toEqual({
      status: 'submitted',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/test\/payments\/webhooks$/),
      expect.objectContaining({
        body: JSON.stringify({
          event_id: 'mobile-fake_pi_1-confirmed',
          event_type: 'payment_intent.succeeded',
          provider_object_id: 'fake_pi_1',
          state: 'confirmed',
        }),
        method: 'POST',
      }),
    );
  });

  it('initializes and presents Stripe PaymentSheet for the server intent', async () => {
    const initPaymentSheet = jest.fn().mockResolvedValue({});
    const presentPaymentSheet = jest.fn().mockResolvedValue({});
    const confirmer = createStripePaymentConfirmer({ initPaymentSheet, presentPaymentSheet });

    await expect(confirmer.confirm(checkout.payment)).resolves.toEqual({
      status: 'submitted',
    });
    expect(initPaymentSheet).toHaveBeenCalledWith({
      merchantDisplayName: 'Coffix',
      paymentIntentClientSecret: 'fake_pi_secret',
      returnURL: 'coffix://stripe-redirect',
    });
    expect(presentPaymentSheet).toHaveBeenCalledTimes(1);
  });
});

describe('read-only payment preview', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('shows cart totals without creating checkout on entry or Back', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response(cart));
    await renderPaymentScreen();

    expect(await screen.findByText('₪30')).toBeOnTheScreen();
    expect(screen.getAllByText('₪102.50')).toHaveLength(2);
    expect(jest.mocked(globalThis.fetch).mock.calls.filter(([, init]) => (
      init?.method === 'POST'
    ))).toHaveLength(0);

    await fireEvent.press(screen.getByRole('button', { name: 'חזרה לכתובת' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(jest.mocked(globalThis.fetch).mock.calls.filter(([, init]) => (
      init?.method === 'POST'
    ))).toHaveLength(0);
  });

  it('creates checkout once on Pay and immediately opens waiting Confirmation', async () => {
    const checkoutRequest = deferred<Response>();
    globalThis.fetch = jest.fn().mockImplementation((_request: string, init?: RequestInit) => (
      init?.method === 'POST'
        ? checkoutRequest.promise
        : Promise.resolve(response(cart))
    ));
    await renderPaymentScreen();
    await screen.findByText('₪30');

    const pay = screen.getByRole('button', { name: 'תשלום מאובטח' });
    await fireEvent.press(pay);
    await fireEvent.press(pay);
    expect(jest.mocked(globalThis.fetch).mock.calls.filter(([, init]) => (
      init?.method === 'POST'
    ))).toHaveLength(1);

    checkoutRequest.resolve(response(checkout, 201));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({
      params: {
        addressId: 'address-1',
        checkoutKey: 'checkout-fixed',
        orderId: 'order-1',
      },
      pathname: '/(tabs)/(shop)/confirmation',
    }));
  });
});
