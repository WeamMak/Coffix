import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CartContent } from '../../app/(tabs)/(shop)/cart';
import type { Cart } from '../../src/features/cart/api';
import { radii } from '../../src/theme';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

const activeCart: Cart = {
  currency: 'ILS',
  expires_at: '2026-09-03T11:00:00Z',
  id: 'cart-1',
  items: [{
    attributes: { weight: '1kg' },
    image_alt_he: 'תמונת תערובת הבית',
    image_url: 'https://images.example/cart-home-blend.jpg',
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
  status: 'active',
  shipping_agorot: 3000,
  subtotal_agorot: 7250,
  total_agorot: 10250,
  total_quantity: 1,
  version: 1,
};

const emptyCart: Cart = {
  ...activeCart,
  items: [],
  subtotal_agorot: 0,
  total_quantity: 0,
  version: 2,
};

const safeAreaMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function response(payload: unknown, status = 200): Response {
  return {
    headers: new Headers(),
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

async function renderCart(fetcher: jest.Mock) {
  globalThis.fetch = fetcher;
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: 0, retry: false, staleTime: 0 },
    },
  });
  await render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <QueryClientProvider client={client}>
        <CartContent sessionScope="session-1" />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('reserved cart screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-03T10:00:00Z'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('renders server items, totals, reservation explanation, and checkout route', async () => {
    await renderCart(jest.fn().mockResolvedValue(response(activeCart)));

    expect(await screen.findByText('הסל שלי')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'חזרה לחנות' })).toHaveStyle({
      borderRadius: radii.pill,
    });
    expect(screen.getByText('תערובת הבית')).toBeOnTheScreen();
    expect(screen.getByTestId('cart-item-footer')).toHaveStyle({ gap: 8 });
    expect(screen.getByLabelText('תמונת תערובת הבית')).toHaveProp(
      'resizeMode',
      'cover',
    );
    expect(screen.getByLabelText('תמונת תערובת הבית')).toHaveStyle({
      height: 112,
      width: 112,
    });
    expect(screen.getAllByText('₪72.50')).toHaveLength(3);
    expect(screen.getByText(/הפריטים שמורים עבורכם/)).toBeOnTheScreen();
    expect(screen.getByRole('button', {
      name: 'הסרת תערובת הבית מהסל',
    })).toBeOnTheScreen();
    expect(screen.getByRole('button', {
      name: 'הגדלת כמות תערובת הבית',
    })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'חזרה לחנות' }));
    expect(router.back).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'המשך לתשלום' }));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/(shop)/checkout');
  });

  it('removes an item optimistically and keeps the empty cart after reconciliation', async () => {
    const fetcher = jest.fn().mockImplementation((_request: string, init?: RequestInit) => (
      init?.method === 'DELETE'
        ? Promise.resolve(response(emptyCart))
        : Promise.resolve(response(activeCart))
    ));
    await renderCart(fetcher);
    await screen.findByText('תערובת הבית');

    await fireEvent.press(screen.getByRole('button', { name: 'הסרת תערובת הבית מהסל' }));
    expect(await screen.findByText('הסל שלך ריק')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'המשך לתשלום' })).not.toBeOnTheScreen();
  });

  it('returns through history from the empty cart action', async () => {
    await renderCart(jest.fn().mockResolvedValue(response(emptyCart)));

    expect(await screen.findByText('הסל שלך ריק')).toBeOnTheScreen();
    const backButtons = screen.getAllByRole('button', { name: 'חזרה לחנות' });
    await fireEvent.press(backButtons.at(-1)!);

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalledWith('/(tabs)/(shop)');
  });

  it('uses the matching catalog photo when uploaded product media is absent', async () => {
    const fallbackCart: Cart = {
      ...activeCart,
      items: [{
        ...activeCart.items[0]!,
        image_alt_he: null,
        image_url: null,
      }],
    };
    await renderCart(jest.fn().mockResolvedValue(response(fallbackCart)));

    const image = await screen.findByLabelText('תערובת הבית');
    expect(image).toHaveProp('source', {
      uri: 'https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=800&q=80',
    });
    expect(image).toHaveProp('resizeMode', 'cover');
    expect(image).toHaveStyle({ height: 112, width: 112 });
  });

  it('replaces optimistic prices with the server response and explains the change', async () => {
    const changedCart: Cart = {
      ...activeCart,
      items: [{
        ...activeCart.items[0]!,
        line_total_agorot: 15000,
        quantity: 2,
        unit_price_agorot: 7500,
      }],
      subtotal_agorot: 15000,
      total_quantity: 2,
      version: 2,
    };
    const fetcher = jest.fn().mockImplementation((_request: string, init?: RequestInit) => (
      init?.method === 'PUT'
        ? Promise.resolve(response(changedCart))
        : Promise.resolve(response(activeCart))
    ));
    await renderCart(fetcher);
    await screen.findByText('תערובת הבית');

    await fireEvent.press(screen.getByRole('button', { name: 'הגדלת כמות תערובת הבית' }));
    expect(await screen.findAllByText('₪150')).toHaveLength(3);
    expect(screen.getByText(
      'המחיר עודכן לפי הסכום הנוכחי בחנות.',
    )).toBeOnTheScreen();
  });

  it('shows expiry guidance and reloads an authoritative empty cart', async () => {
    let reads = 0;
    const fetcher = jest.fn().mockImplementation(() => {
      reads += 1;
      return reads === 1
        ? Promise.resolve(response({
            code: 'CART_EXPIRED',
            correlationId: 'cart-expired',
            status: 409,
            title: 'Cart expired',
            type: 'about:blank',
          }, 409))
        : Promise.resolve(response(emptyCart));
    });
    await renderCart(fetcher);

    expect(await screen.findByText('שמירת הסל הסתיימה')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'טעינת סל עדכני' }));
    expect(await screen.findByText('הסל שלך ריק')).toBeOnTheScreen();
    expect(reads).toBe(2);
  });
});
