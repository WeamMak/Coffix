import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { Text as NativeText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProductDetailContent } from '../../app/(tabs)/(shop)/product/[productId]';
import { queryClient } from '../../src/api/queryClient';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { AuthSessionProvider, useSession } from '../../src/features/auth/useSession';
import type { Product } from '../../src/features/catalog/types';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue('access-token'),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ productId: 'product-1' })),
}));

const availableProduct: Product = {
  category_id: 'category-1',
  created_at: '2026-09-02T10:00:00Z',
  description_he: 'תערובת מאוזנת עם גוף מלא ושוקולד מריר.',
  id: 'product-1',
  is_active: true,
  is_featured: true,
  media: [{
    alt_text_he: 'שקית תערובת הבית', id: 'media-1', media_type: 'image/jpeg',
    sku_id: null, sort_order: 1, url: 'https://images.example/home.jpg',
  }],
  name_he: 'תערובת הבית',
  product_type: 'beans',
  skus: [{
    attributes: { weight: '1kg' }, currency: 'ILS', id: 'sku-available', is_active: true,
    machine_model_id: null, price_agorot: 7250, sku_code: 'HOME-1KG', stock_quantity: 3,
  }],
  updated_at: '2026-09-02T10:00:00Z',
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

function renderProduct(
  product: Product = availableProduct,
  navigation: { categoryId?: string; source?: 'category' | 'home' | 'shop' } = {},
) {
  globalThis.fetch = jest.fn().mockImplementation((request: string, init?: RequestInit) => (
    init?.method === 'POST'
      ? Promise.resolve(response({ id: 'cart-1', items: [] }))
      : Promise.resolve(response(product))
  ));
  const client = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: 0, retry: false },
      queries: { gcTime: 0, retry: false },
    },
  });
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <QueryClientProvider client={client}>
        <ProductDetailContent
          categoryId={navigation.categoryId}
          productId={product.id}
          sessionScope="session-1"
          source={navigation.source}
        />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

function AuthenticatedProductHarness() {
  const { sessionScope, status } = useSession();
  return status === 'authenticated' && sessionScope ? (
    <ProductDetailContent productId="product-1" sessionScope={sessionScope} />
  ) : <NativeText>{status}</NativeText>;
}

describe('catalog shared states', () => {
  it('exposes empty and retry actions as named buttons', async () => {
    const onEmptyAction = jest.fn();
    const onRetry = jest.fn();

    await render(
      <>
        <EmptyState
          actionLabel="חזרה לחנות"
          description="כדאי לנסות קטגוריה אחרת"
          onAction={onEmptyAction}
          title="אין מוצרים להצגה"
        />
        <ErrorState message="לא הצלחנו לטעון את המוצר" onRetry={onRetry} />
      </>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'חזרה לחנות' }));
    await fireEvent.press(screen.getByRole('button', { name: 'ניסיון נוסף' }));

    expect(onEmptyAction).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('QuantityStepper', () => {
  it('reports its value, changes within range, and disables boundary actions', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(
      <QuantityStepper maximum={3} minimum={1} onChange={onChange} value={1} />,
    );

    expect(screen.getByRole('adjustable')).toHaveAccessibilityValue({
      max: 3,
      min: 1,
      now: 1,
    });
    expect(screen.getByRole('button', { name: 'הפחתת כמות' })).toBeDisabled();
    expect(screen.getByRole('adjustable')).toHaveStyle({ minHeight: 56 });
    expect(screen.getByRole('button', { name: 'הגדלת כמות' })).toHaveStyle({ minHeight: 56 });

    await fireEvent.press(screen.getByRole('button', { name: 'הגדלת כמות' }));
    expect(onChange).toHaveBeenLastCalledWith(2);

    await rerender(
      <QuantityStepper maximum={3} minimum={1} onChange={onChange} value={3} />,
    );
    expect(screen.getByRole('button', { name: 'הגדלת כמות' })).toBeDisabled();
  });
});

describe('product-detail route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('access-token');
  });

  afterEach(async () => {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  });

  it('renders product media, description, SKU details, price, and stock', async () => {
    const productDetail = await renderProduct();

    expect(await screen.findByText('תערובת הבית')).toBeOnTheScreen();
    expect(JSON.stringify(productDetail.toJSON())).toContain(
      '"edges":{"top":"off","right":"off","bottom":"additive","left":"off"}',
    );
    expect(screen.getByLabelText('שקית תערובת הבית')).toBeOnTheScreen();
    expect(screen.getByText('תערובת מאוזנת עם גוף מלא ושוקולד מריר.')).toBeOnTheScreen();
    expect(screen.getByText(/1kg/)).toBeOnTheScreen();
    expect(screen.getByText('₪72.50')).toBeOnTheScreen();
    expect(screen.getByText('נותרו 3 במלאי')).toBeOnTheScreen();
    expect(screen.getByLabelText('מפרט מוצר')).toBeOnTheScreen();
    expect(screen.getByLabelText('אפשרויות רכישה')).toBeOnTheScreen();
    expect(screen.queryByText(/דירוג|ביקורות|מועדפים/)).not.toBeOnTheScreen();
  });

  it('returns explicitly to the screen that opened the product', async () => {
    const home = await renderProduct(availableProduct, { source: 'home' });
    await screen.findByText('תערובת הבית');
    await fireEvent.press(screen.getByRole('button', { name: 'חזרה' }));
    expect(router.replace).toHaveBeenLastCalledWith('/(tabs)/(home)');
    await home.unmount();

    const shop = await renderProduct(availableProduct, { source: 'shop' });
    await screen.findByText('תערובת הבית');
    await fireEvent.press(screen.getByRole('button', { name: 'חזרה' }));
    expect(router.replace).toHaveBeenLastCalledWith('/(tabs)/(shop)');
    await shop.unmount();

    await renderProduct(availableProduct, {
      categoryId: 'category-1',
      source: 'category',
    });
    await screen.findByText('תערובת הבית');
    await fireEvent.press(screen.getByRole('button', { name: 'חזרה' }));
    expect(router.replace).toHaveBeenLastCalledWith({
      params: { categoryId: 'category-1' },
      pathname: '/(tabs)/(shop)/products/[categoryId]',
    });
  });

  it('caps quantity at stock and submits only SKU ID and quantity', async () => {
    await renderProduct();
    await screen.findByText('תערובת הבית');

    await fireEvent.press(screen.getByRole('button', { name: 'הגדלת כמות' }));
    await fireEvent.press(screen.getByRole('button', { name: 'הגדלת כמות' }));
    expect(screen.getByRole('button', { name: 'הגדלת כמות' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'הוספה לסל' }));

    const postCall = jest.mocked(globalThis.fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      quantity: 3,
      sku_id: 'sku-available',
    });
  });

  it.each([
    ['inactive', { ...availableProduct, is_active: false }],
    ['zero stock', {
      ...availableProduct,
      skus: [{ ...availableProduct.skus[0]!, stock_quantity: 0 }],
    }],
    ['missing SKU', { ...availableProduct, skus: [] }],
  ])('disables cart submission for %s products', async (_label, product) => {
    await renderProduct(product as Product);
    await screen.findByText('תערובת הבית');

    expect(screen.getByRole('button', { name: 'הוספה לסל' })).toBeDisabled();
  });

  it('clears the private session without retrying catalog after refresh expiry', async () => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => (
      key === 'coffix.refreshToken' ? `${sessionId}.refresh` : 'expired-access'
    ));
    let refreshCalls = 0;
    globalThis.fetch = jest.fn().mockImplementation((request: string) => {
      const url = new URL(request);
      if (url.pathname.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return Promise.resolve(refreshCalls === 1
          ? response({
            access_token: 'rotated-access',
            refresh_token: `${sessionId}.rotated`,
            token_type: 'bearer',
          })
          : response({ code: 'refresh_token_expired', status: 401 }, 401));
      }
      return Promise.resolve(response({ code: 'unauthorized', status: 401 }, 401));
    });
    const originalDefaults = queryClient.getDefaultOptions();
    queryClient.setDefaultOptions({
      ...originalDefaults,
      queries: { ...originalDefaults.queries, gcTime: 0 },
    });
    queryClient.clear();
    const clearQueries = jest.spyOn(queryClient, 'clear');

    const { unmount } = await render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <QueryClientProvider client={queryClient}>
          <AuthSessionProvider>
            <AuthenticatedProductHarness />
          </AuthSessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

    await waitFor(() => {
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('coffix.accessToken');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('coffix.refreshToken');
      expect(clearQueries).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('unauthenticated')).toBeOnTheScreen();
    const catalogCalls = jest.mocked(globalThis.fetch).mock.calls.filter(([url]) => (
      String(url).includes('/catalog/products/product-1')
    ));
    expect(catalogCalls).toHaveLength(1);
    expect(refreshCalls).toBe(2);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    clearQueries.mockRestore();
    await unmount();
    queryClient.clear();
    queryClient.setDefaultOptions(originalDefaults);
  });
});
