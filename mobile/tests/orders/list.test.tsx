import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OrdersListContent } from '../../app/(tabs)/(orders)/index';
import type { Order } from '../../src/features/orders/api';
import { invalidateOrders, orderKeys } from '../../src/features/orders/queries';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

const safeAreaMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function baseOrder(overrides: Partial<Order>): Order {
  return {
    address: {
      apartment: null,
      building: '10',
      city: 'תל אביב',
      country: 'IL',
      phone_e164: '+972501112222',
      postal_code: null,
      recipient_name: 'מאיה כהן',
      street: 'דיזנגוף',
    },
    allowed_actions: [],
    created_at: '2026-09-01T08:00:00Z',
    currency: 'ILS',
    history: [],
    id: 'order-x',
    items: [{
      attributes: {},
      currency: 'ILS',
      id: 'item-x',
      line_total_agorot: 7900,
      machine_model_id: null,
      product_id: 'p-x',
      product_name_he: 'מכונת אספרסו',
      quantity: 1,
      sku_code: 'ESP-1',
      sku_id: 'sku-x',
      unit_price_agorot: 7900,
    }],
    order_number: 'CFX-DEMO-000',
    payment_deadline: '2026-09-01T08:30:00Z',
    shipment: null,
    shipping_agorot: 3000,
    state: 'paid',
    subtotal_agorot: 7900,
    total_agorot: 10900,
    ...overrides,
  };
}

const orders: Order[] = [
  baseOrder({ id: 'o-pending', order_number: 'CFX-DEMO-001', state: 'pending_payment', created_at: '2026-09-08T08:00:00Z' }),
  baseOrder({ id: 'o-paid', order_number: 'CFX-DEMO-002', state: 'paid', created_at: '2026-09-07T08:00:00Z' }),
  baseOrder({ id: 'o-processing', order_number: 'CFX-DEMO-003', state: 'processing', created_at: '2026-09-06T08:00:00Z' }),
  baseOrder({ id: 'o-shipped', order_number: 'CFX-DEMO-004', state: 'shipped', created_at: '2026-09-05T08:00:00Z' }),
  baseOrder({ id: 'o-delivered', order_number: 'CFX-DEMO-005', state: 'delivered', created_at: '2026-09-04T08:00:00Z' }),
  baseOrder({ id: 'o-expired', order_number: 'CFX-DEMO-006', state: 'payment_expired', created_at: '2026-09-03T08:00:00Z' }),
  baseOrder({ id: 'o-cancelled', order_number: 'CFX-DEMO-007', state: 'cancelled', created_at: '2026-09-02T08:00:00Z' }),
  baseOrder({ id: 'o-refunded', order_number: 'CFX-DEMO-008', state: 'refunded', created_at: '2026-09-01T08:00:00Z' }),
];

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    headers: new Headers(),
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

async function renderList(fetcher: jest.Mock) {
  globalThis.fetch = fetcher;
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  await render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <QueryClientProvider client={client}>
        <OrdersListContent sessionScope="session-1" />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { client };
}

describe('orders list', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('renders orders with Hebrew status labels and totals and routes to detail', async () => {
    await renderList(jest.fn().mockResolvedValue(jsonResponse(orders)));

    expect(await screen.findByText('ההזמנות שלי')).toBeOnTheScreen();
    expect(screen.getByText('CFX-DEMO-002')).toBeOnTheScreen();
    expect(screen.getByText('שולם')).toBeOnTheScreen();
    expect(screen.getByText('נשלח')).toBeOnTheScreen();
    expect(screen.getByText('בוטלה')).toBeOnTheScreen();
    expect(screen.getAllByText('₪109').length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByRole('button', { name: /CFX-DEMO-004/ }));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/(orders)/o-shipped');
  });

  it('partitions orders into active and finished buckets', async () => {
    await renderList(jest.fn().mockResolvedValue(jsonResponse(orders)));
    await screen.findByText('CFX-DEMO-001');

    await fireEvent.press(screen.getByRole('button', { name: 'פעילות' }));
    expect(screen.getByText('CFX-DEMO-001')).toBeOnTheScreen();
    expect(screen.getByText('CFX-DEMO-004')).toBeOnTheScreen();
    expect(screen.queryByText('CFX-DEMO-005')).not.toBeOnTheScreen();
    expect(screen.queryByText('CFX-DEMO-007')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'הסתיימו' }));
    expect(screen.getByText('CFX-DEMO-005')).toBeOnTheScreen();
    expect(screen.getByText('CFX-DEMO-007')).toBeOnTheScreen();
    expect(screen.getByText('CFX-DEMO-008')).toBeOnTheScreen();
    expect(screen.queryByText('CFX-DEMO-001')).not.toBeOnTheScreen();
  });

  it('shows an empty state when the selected filter has no orders', async () => {
    await renderList(jest.fn().mockResolvedValue(jsonResponse([
      baseOrder({ id: 'o-done', order_number: 'CFX-DONE', state: 'delivered' }),
    ])));
    await screen.findByText('CFX-DONE');

    await fireEvent.press(screen.getByRole('button', { name: 'פעילות' }));
    expect(screen.getByText('אין הזמנות פעילות')).toBeOnTheScreen();
  });

  it('reloads the list on pull-to-refresh', async () => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse(orders));
    await renderList(fetcher);
    await screen.findByText('CFX-DEMO-001');
    const before = fetcher.mock.calls.length;

    await fireEvent(screen.getByTestId('orders-list'), 'refresh');
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(before));
  });

  it('exposes no cancel or refund controls', async () => {
    await renderList(jest.fn().mockResolvedValue(jsonResponse(orders)));
    await screen.findByText('CFX-DEMO-001');

    expect(screen.queryByRole('button', { name: /ביטול|לבטל|החזר|refund|cancel/i })).toBeNull();
  });

  it('offers a retry after a failed load', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        code: 'INTERNAL', correlationId: 'x', status: 500, title: 'boom', type: 'about:blank',
      }, 500))
      .mockResolvedValue(jsonResponse(orders));
    await renderList(fetcher);

    await fireEvent.press(await screen.findByRole('button', { name: 'ניסיון נוסף' }));
    expect(await screen.findByText('CFX-DEMO-001')).toBeOnTheScreen();
  });

  it('invalidateOrders marks the list and each affected order stale', () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, 'invalidateQueries');

    invalidateOrders(client, 'session-1', ['order-9']);

    expect(spy).toHaveBeenCalledWith({ queryKey: orderKeys.list('session-1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: orderKeys.detail('session-1', 'order-9') });
  });
});
