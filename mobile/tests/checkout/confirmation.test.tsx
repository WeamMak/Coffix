import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfirmationContent } from '../../app/(tabs)/(shop)/confirmation';
import type { Checkout } from '../../src/features/cart/api';
import { cartKeys } from '../../src/features/cart/queries';
import type { PaymentConfirmer } from '../../src/features/payments/usePayment';

jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({ children }: { children: unknown }) => children,
  useStripe: () => ({
    initPaymentSheet: jest.fn(),
    presentPaymentSheet: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({
    addressId: 'address-1',
    checkoutKey: 'checkout-fixed',
    orderId: 'order-1',
  })),
}));

const order = {
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
  order,
  payment: {
    client_secret: 'fake_pi_secret',
    payment_id: 'payment-1',
    provider_payment_id: 'fake_pi_1',
    state: 'pending',
  },
};

function response(payload: unknown): Response {
  return {
    headers: new Headers(),
    ok: true,
    status: 200,
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

type RenderOptions = {
  addressId?: string;
  checkoutKey?: string;
  confirmer: PaymentConfirmer;
  withCheckout?: boolean;
};

async function renderConfirmation({
  addressId = 'address-1',
  checkoutKey = 'checkout-fixed',
  confirmer,
  withCheckout = true,
}: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  if (withCheckout) {
    client.setQueryData(cartKeys.checkout('session-1', checkoutKey), checkout);
  }
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await render(
    <SafeAreaProvider initialMetrics={{
      frame: { height: 844, width: 390, x: 0, y: 0 },
      insets: { bottom: 34, left: 0, right: 0, top: 44 },
    }}>
      <QueryClientProvider client={client}>
        <ConfirmationContent
          addressId={addressId}
          checkoutKey={checkoutKey}
          confirmer={confirmer}
          orderId="order-1"
          pollIntervalMs={10}
          sessionScope="session-1"
        />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { invalidate };
}

describe('server-backed order confirmation', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('opens in waiting, confirms once, then automatically renders verified UI', async () => {
    let paid = false;
    const confirmation = deferred<{ status: 'submitted' }>();
    const confirmer: PaymentConfirmer = {
      confirm: jest.fn().mockImplementation(async () => {
        const result = await confirmation.promise;
        paid = true;
        return result;
      }),
    };
    globalThis.fetch = jest.fn().mockImplementation(() => Promise.resolve(response({
      ...order,
      state: paid ? 'paid' : 'pending_payment',
    })));

    const { invalidate } = await renderConfirmation({ confirmer });
    expect(await screen.findByText('ממתינים לאישור התשלום')).toBeOnTheScreen();
    expect(confirmer.confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('ההזמנה התקבלה.')).not.toBeOnTheScreen();

    confirmation.resolve({ status: 'submitted' });
    expect(await screen.findByText('ההזמנה התקבלה.')).toBeOnTheScreen();
    expect(screen.getByText('CFX-1001')).toBeOnTheScreen();
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({
      queryKey: cartKeys.cart('session-1'),
    }));
  });

  it('keeps the cart when confirmation is declined and allows retry', async () => {
    const confirmer: PaymentConfirmer = {
      confirm: jest.fn().mockResolvedValue({
        message: 'הכרטיס נדחה.',
        status: 'declined',
      }),
    };
    globalThis.fetch = jest.fn().mockResolvedValue(response(order));

    const { invalidate } = await renderConfirmation({ confirmer });
    expect(await screen.findByText('הכרטיס נדחה.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'ניסיון תשלום נוסף' })).toBeOnTheScreen();
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: cartKeys.cart('session-1'),
    });

    await fireEvent.press(screen.getByRole('button', { name: 'ניסיון תשלום נוסף' }));
    await waitFor(() => expect(confirmer.confirm).toHaveBeenCalledTimes(2));
  });

  it('deep-linked pending orders only poll and never guess payment credentials', async () => {
    const confirmer: PaymentConfirmer = { confirm: jest.fn() };
    globalThis.fetch = jest.fn().mockResolvedValue(response(order));

    await renderConfirmation({
      addressId: '',
      checkoutKey: '',
      confirmer,
      withCheckout: false,
    });
    expect(await screen.findByText('ממתינים לאישור התשלום')).toBeOnTheScreen();
    expect(confirmer.confirm).not.toHaveBeenCalled();
    expect(jest.mocked(globalThis.fetch).mock.calls.some(([, init]) => (
      init?.method === 'POST'
    ))).toBe(false);
  });

  it('routes to tracking from authoritative paid order details', async () => {
    const confirmer: PaymentConfirmer = { confirm: jest.fn() };
    globalThis.fetch = jest.fn().mockResolvedValue(response({ ...order, state: 'paid' }));

    await renderConfirmation({
      addressId: '',
      checkoutKey: '',
      confirmer,
      withCheckout: false,
    });
    expect(await screen.findByText('ההזמנה התקבלה.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'מעקב אחרי ההזמנה' }));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/(orders)/order-1');
  });
});
