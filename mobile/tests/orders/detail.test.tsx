import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OrderDetailContent } from '../../app/(tabs)/(orders)/[orderId]';
import type { Order } from '../../src/features/orders/api';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({ orderId: 'order-1' })),
}));

const safeAreaMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const history: Order['history'] = [
  { created_at: '2026-09-05T09:00:00Z', from_state: 'processing', reason: null, source: 'admin', to_state: 'shipped' },
  { created_at: '2026-09-01T08:00:00Z', from_state: null, reason: null, source: 'customer', to_state: 'pending_payment' },
  { created_at: '2026-09-02T10:00:00Z', from_state: 'pending_payment', reason: null, source: 'provider', to_state: 'paid' },
  { created_at: '2026-09-03T11:00:00Z', from_state: 'paid', reason: null, source: 'admin', to_state: 'processing' },
];

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    address: {
      apartment: '4',
      building: '12',
      city: 'תל אביב',
      country: 'IL',
      phone_e164: '+972501234567',
      postal_code: '6100000',
      recipient_name: 'מאיה כהן',
      street: 'דיזנגוף',
    },
    allowed_actions: [],
    created_at: '2026-09-01T08:00:00Z',
    currency: 'ILS',
    history,
    id: 'order-1',
    items: [{
      attributes: { color: 'שחור' },
      currency: 'ILS',
      id: 'i1',
      line_total_agorot: 15800,
      machine_model_id: null,
      product_id: 'p1',
      product_name_he: 'מכונת אספרסו ידנית',
      quantity: 2,
      sku_code: 'ESP-BLK',
      sku_id: 's1',
      unit_price_agorot: 7900,
    }],
    order_number: 'CFX-DEMO-004',
    payment_deadline: '2026-09-01T08:30:00Z',
    shipment: {
      carrier: 'דואר ישראל',
      delivered_at: null,
      shipped_at: '2026-09-05T09:00:00Z',
      tracking_number: 'RR123456789IL',
      tracking_url: 'https://track.example/RR123456789IL',
    },
    shipping_agorot: 0,
    state: 'shipped',
    subtotal_agorot: 15800,
    total_agorot: 15800,
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    headers: new Headers(),
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

async function renderDetail(fetcher: jest.Mock) {
  globalThis.fetch = fetcher;
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  await render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <QueryClientProvider client={client}>
        <OrderDetailContent orderId="order-1" sessionScope="session-1" />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('order detail', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('shows fulfillment progress, carrier data, and a safe tracking link', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse(makeOrder())));

    const tracking = await screen.findByTestId('tracking-card');
    expect(within(tracking).getByTestId('tracking-status')).toHaveTextContent('נשלח');
    expect(screen.getByTestId('tracking-progress')).toBeOnTheScreen();
    expect(within(tracking).getByText('הוזמן')).toBeOnTheScreen();
    expect(within(tracking).getByText('דואר ישראל')).toBeOnTheScreen();
    expect(within(tracking).getByText('RR123456789IL')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'מעקב אחר המשלוח' }));
    expect(openURL).toHaveBeenCalledWith('https://track.example/RR123456789IL');
  });

  it('keeps carrier data but hides the link when tracking is manual or unsafe', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse(makeOrder({
      shipment: {
        carrier: 'דואר ישראל',
        delivered_at: null,
        shipped_at: '2026-09-05T09:00:00Z',
        tracking_number: 'RR123456789IL',
        tracking_url: 'http://track.example/insecure',
      },
    }))));

    expect(await screen.findByText('RR123456789IL')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'מעקב אחר המשלוח' })).toBeNull();
  });

  it('renders the status timeline oldest to newest regardless of payload order', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse(makeOrder())));
    await screen.findByTestId('order-timeline');

    const labels = screen.getAllByTestId('timeline-label').map((node) => node.props.children);
    expect(labels).toEqual(['ממתין לתשלום', 'שולם', 'בהכנה', 'נשלח']);
  });

  it('renders immutable item snapshots without fetching the catalog', async () => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse(makeOrder()));
    await renderDetail(fetcher);

    expect(await screen.findByText('מכונת אספרסו ידנית')).toBeOnTheScreen();
    expect(screen.getByText('כמות: 2')).toBeOnTheScreen();
    expect(fetcher.mock.calls.every(([url]) => String(url).includes('/orders/'))).toBe(true);
  });

  it('shows server totals with free shipping and the delivery address', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse(makeOrder())));

    expect(await screen.findByText('חינם')).toBeOnTheScreen();
    expect(screen.getAllByText('₪158').length).toBeGreaterThan(0);
    expect(screen.getByText(/דיזנגוף/)).toBeOnTheScreen();
  });

  it('drops the progress bar and explains terminal states', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse(makeOrder({
      state: 'cancelled',
      shipment: null,
      history: [
        { created_at: '2026-09-01T08:00:00Z', from_state: null, reason: null, source: 'customer', to_state: 'pending_payment' },
        { created_at: '2026-09-02T09:00:00Z', from_state: 'pending_payment', reason: 'לבקשת הלקוח', source: 'admin', to_state: 'cancelled' },
      ],
    }))));

    await screen.findByTestId('tracking-card');
    expect(screen.queryByTestId('tracking-progress')).toBeNull();
    expect(screen.getByText('ההזמנה בוטלה.')).toBeOnTheScreen();
  });

  it('shows a friendly message for a missing or foreign order', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse({
      code: 'ORDER_NOT_FOUND', correlationId: 'x', status: 404, title: 'Order not found', type: 'about:blank',
    }, 404)));

    expect(await screen.findByText('לא מצאנו את ההזמנה')).toBeOnTheScreen();
  });

  it('reloads the order on pull-to-refresh', async () => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse(makeOrder()));
    await renderDetail(fetcher);
    await screen.findByTestId('tracking-card');
    const before = fetcher.mock.calls.length;

    await fireEvent(screen.getByTestId('order-detail-list'), 'refresh');
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(before));
  });

  it('exposes no cancel or refund controls', async () => {
    await renderDetail(jest.fn().mockResolvedValue(jsonResponse(makeOrder())));
    await screen.findByTestId('tracking-card');

    expect(screen.queryByRole('button', { name: /ביטול|לבטל|החזר|refund|cancel/i })).toBeNull();
  });
});
