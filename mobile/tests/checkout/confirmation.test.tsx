import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfirmationContent } from '../../app/(tabs)/(shop)/confirmation';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ orderId: 'order-1' })),
}));

const order = {
  address: {
    apartment: null,
    building: '12',
    city: 'תל אביב',
    country: 'IL',
    phone_e164: '+972501234567',
    postal_code: null,
    recipient_name: 'מאיה כהן',
    street: 'דיזנגוף',
  },
  allowed_actions: [],
  created_at: '2026-09-03T10:00:00Z',
  currency: 'ILS',
  history: [],
  id: 'order-1',
  items: [],
  order_number: 'CFX-1001',
  payment_deadline: '2026-09-03T10:30:00Z',
  shipment: null,
  shipping_agorot: 2900,
  state: 'paid',
  subtotal_agorot: 7250,
  total_agorot: 10150,
};

function response(payload: unknown): Response {
  return {
    headers: new Headers(),
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  } as Response;
}

async function renderConfirmation(state: string) {
  globalThis.fetch = jest.fn().mockResolvedValue(response({ ...order, state }));
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  await render(
    <SafeAreaProvider initialMetrics={{
      frame: { height: 844, width: 390, x: 0, y: 0 },
      insets: { bottom: 34, left: 0, right: 0, top: 44 },
    }}>
      <QueryClientProvider client={client}>
        <ConfirmationContent orderId="order-1" sessionScope="session-1" />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('server-backed order confirmation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not claim success while the deep-linked order is pending', async () => {
    await renderConfirmation('pending_payment');

    expect(await screen.findByText('ממתינים לאישור התשלום')).toBeOnTheScreen();
    expect(screen.queryByText('ההזמנה התקבלה.')).not.toBeOnTheScreen();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/orders\/order-1$/),
      expect.any(Object),
    );
  });

  it('renders the authoritative order and routes to tracking after payment', async () => {
    await renderConfirmation('paid');

    expect(await screen.findByText('ההזמנה התקבלה.')).toBeOnTheScreen();
    expect(screen.getByText('CFX-1001')).toBeOnTheScreen();
    expect(screen.getByText('₪101.50')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'מעקב אחרי ההזמנה' }));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/(orders)/order-1');
  });
});
