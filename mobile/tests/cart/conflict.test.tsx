import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import { useCartMutations } from '../../src/features/cart/mutations';
import { useCart } from '../../src/features/cart/queries';
import type { Cart } from '../../src/features/cart/api';

const baseCart: Cart = {
  currency: 'ILS',
  expires_at: '2026-09-03T11:00:00Z',
  id: 'cart-1',
  items: [{
    attributes: { weight: '1kg' },
    image_alt_he: null,
    image_url: null,
    is_active: true,
    line_total_agorot: 7250,
    name_he: 'תערובת הבית',
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

function cartWith(quantity: number, version = quantity): Cart {
  return {
    ...baseCart,
    items: [{
      ...baseCart.items[0]!,
      line_total_agorot: 7250 * quantity,
      quantity,
    }],
    subtotal_agorot: 7250 * quantity,
    total_agorot: 7250 * quantity + baseCart.shipping_agorot,
    total_quantity: quantity,
    version,
  };
}

function response(payload: unknown, status = 200): Response {
  return {
    headers: new Headers({ 'x-correlation-id': 'cart-test' }),
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

function CartHarness() {
  const cart = useCart('session-1');
  const mutations = useCartMutations('session-1');
  const quantity = cart.data?.items[0]?.quantity ?? 0;
  return (
    <View>
      <Text>{quantity}</Text>
      <Pressable
        accessibilityLabel="הגדלה"
        accessibilityRole="button"
        onPress={() => mutations.setQuantity('sku-1', quantity + 1)}
      />
      <Text>{mutations.message}</Text>
    </View>
  );
}

async function renderHarness() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: 0, retry: false, staleTime: 0 },
    },
  });
  await render(
    <QueryClientProvider client={client}>
      <CartHarness />
    </QueryClientProvider>,
  );
  return client;
}

describe('serialized optimistic cart mutations', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates immediately and sends only one request per SKU at a time', async () => {
    const firstUpdate = deferred<Response>();
    globalThis.fetch = jest.fn().mockImplementation((_request: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const quantity = JSON.parse(String(init.body)).quantity as number;
        return quantity === 2
          ? firstUpdate.promise
          : Promise.resolve(response(cartWith(quantity)));
      }
      return Promise.resolve(response(baseCart));
    });
    await renderHarness();
    await screen.findByText('1');

    fireEvent.press(screen.getByRole('button', { name: 'הגדלה' }));
    expect(await screen.findByText('2')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'הגדלה' }));
    expect(await screen.findByText('3')).toBeOnTheScreen();

    const putCalls = jest.mocked(globalThis.fetch).mock.calls.filter(([, init]) => (
      init?.method === 'PUT'
    ));
    expect(putCalls).toHaveLength(1);

    firstUpdate.resolve(response(cartWith(2)));
    await waitFor(() => {
      const updates = jest.mocked(globalThis.fetch).mock.calls.filter(([, init]) => (
        init?.method === 'PUT'
      ));
      expect(updates).toHaveLength(2);
      expect(JSON.parse(String(updates[1]?.[1]?.body))).toEqual({ quantity: 3 });
    });
    expect(await screen.findByText('3')).toBeOnTheScreen();
  });

  it('rolls back and reconciles an insufficient-stock rejection', async () => {
    let cartReads = 0;
    const rejectedUpdate = deferred<Response>();
    globalThis.fetch = jest.fn().mockImplementation((_request: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return rejectedUpdate.promise;
      }
      cartReads += 1;
      return Promise.resolve(response(baseCart));
    });
    await renderHarness();
    await screen.findByText('1');

    fireEvent.press(screen.getByRole('button', { name: 'הגדלה' }));
    expect(await screen.findByText('2')).toBeOnTheScreen();
    rejectedUpdate.resolve(response({
          code: 'INSUFFICIENT_STOCK',
          correlationId: 'cart-test',
          status: 409,
          title: 'Insufficient stock',
          type: 'about:blank',
        }, 409));
    expect(await screen.findByText(
      'אין מספיק מלאי לכמות שבחרתם. הסל עודכן.',
    )).toBeOnTheScreen();
    await waitFor(() => expect(cartReads).toBeGreaterThanOrEqual(2));
    expect(screen.getByText('1')).toBeOnTheScreen();
  });
});
