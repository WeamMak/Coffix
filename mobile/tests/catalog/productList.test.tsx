import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ProductListContent } from '../../app/(tabs)/(shop)/products/[categoryId]';
import { ProductGrid } from '../../src/components/ProductGrid';
import type { Category, Product } from '../../src/features/catalog/types';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue('access-token'),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({ categoryId: 'category-1' })),
}));

const category: Category = {
  icon_key: 'coffee-bean',
  id: 'category opaque/1',
  image_url: null,
  is_active: true,
  name_he: 'פולי קפה',
  product_count: 2,
  slug: 'beans',
  sort_order: 1,
};

function product(overrides: Partial<Product> = {}): Product {
  return {
    category_id: category.id,
    created_at: '2026-09-02T10:00:00Z',
    description_he: 'תערובת הבית',
    id: 'product-1',
    is_active: true,
    is_featured: false,
    media: [{
      alt_text_he: 'שקית פולי קפה על שולחן עץ',
      id: 'media-1',
      media_type: 'image/jpeg',
      sku_id: null,
      sort_order: 1,
      url: 'https://images.example/coffee.jpg',
    }],
    name_he: 'פולי קפה הבית',
    product_type: 'beans',
    skus: [{
      attributes: { weight: '1kg' },
      currency: 'ILS',
      id: 'sku-1',
      is_active: true,
      machine_model_id: null,
      price_agorot: 7250,
      sku_code: 'BEANS-1KG',
      stock_quantity: 3,
    }],
    updated_at: '2026-09-02T10:00:00Z',
    ...overrides,
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    headers: new Headers(),
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  } as Response;
}

describe('ProductGrid', () => {
  it('renders two-column accessible cards and blocks inactive products', async () => {
    const onProductPress = jest.fn();
    const products = [
      product(),
      product({
        id: 'product-sold-out',
        media: [],
        name_he: 'קפה אזל',
        skus: [{ ...product().skus[0]!, id: 'sku-sold-out', stock_quantity: 0 }],
      }),
      product({ id: 'product-inactive', is_active: false, name_he: 'קפה ישן' }),
    ];

    await render(
      <ProductGrid
        categories={[category]}
        onProductPress={onProductPress}
        products={products}
      />,
    );

    expect(screen.getByTestId('product-grid')).toHaveStyle({
      flexDirection: 'row',
      flexWrap: 'wrap',
    });
    expect(screen.getAllByLabelText('שקית פולי קפה על שולחן עץ')).toHaveLength(2);
    expect(screen.getAllByText('₪72.50')).toHaveLength(3);
    expect(screen.getByText('אזל מהמלאי')).toBeOnTheScreen();
    expect(screen.getByText('לא זמין')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: /פולי קפה הבית.*₪72.50/ }));
    await fireEvent.press(screen.getByRole('button', { name: /קפה ישן/ }));

    expect(onProductPress).toHaveBeenCalledTimes(1);
    expect(onProductPress).toHaveBeenCalledWith('product-1');
    expect(screen.getByRole('button', { name: /קפה ישן/ })).toBeDisabled();
  });
});

describe('product-list route', () => {
  it('keeps both pages and uses explicit category navigation', async () => {
    const first = product();
    const second = product({ id: 'product-2', name_he: 'פולי קפה ערביקה' });
    globalThis.fetch = jest.fn().mockImplementation((request: string) => {
      const url = new URL(request);
      if (url.pathname.endsWith('/cart')) {
        return Promise.resolve(jsonResponse({
          currency: 'ILS',
          expires_at: '2099-09-03T11:00:00Z',
          id: 'cart-1',
          items: [],
          last_activity_at: '2026-09-03T10:00:00Z',
          shipping_agorot: 3000,
          status: 'active',
          subtotal_agorot: 0,
          total_agorot: 3000,
          total_quantity: 2,
          version: 1,
        }));
      }
      if (url.pathname.endsWith('/catalog/categories')) {
        return Promise.resolve(jsonResponse([category]));
      }
      const page = Number(url.searchParams.get('page'));
      return Promise.resolve(jsonResponse({
        items: page === 1 ? [first] : [second],
        limit: 1,
        page,
        total: 2,
      }));
    });
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });

    await render(
      <QueryClientProvider client={client}>
        <ProductListContent categoryId="category opaque/1" sessionScope="session-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('פולי קפה הבית')).toBeOnTheScreen();
    expect(screen.getByTestId('category-header-copy')).toHaveStyle({
      alignItems: 'flex-end',
      direction: 'ltr',
    });
    expect(screen.getByTestId('category-eyebrow')).toHaveStyle({
      alignSelf: 'flex-end',
      textAlign: 'right',
      writingDirection: 'rtl',
    });
    expect(screen.getByTestId('category-title')).toHaveStyle({
      alignSelf: 'flex-end',
      textAlign: 'right',
      writingDirection: 'rtl',
    });
    const cartButton = screen.getByRole('button', { name: 'פתיחת הסל, 2 פריטים' });
    await fireEvent.press(cartButton);
    expect(router.push).toHaveBeenCalledWith('/(tabs)/(shop)/cart');
    expect(jest.mocked(globalThis.fetch).mock.calls.some(([url]) => (
      String(url).includes('category_id=category+opaque%2F1')
    ))).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'טעינת מוצרים נוספים' }));
    expect(await screen.findByText('פולי קפה ערביקה')).toBeOnTheScreen();
    expect(screen.getAllByText('פולי קפה הבית')).toHaveLength(1);

    await fireEvent.press(screen.getByRole('button', { name: 'חזרה' }));
    expect(router.back).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: /פולי קפה ערביקה/ }));
    expect(router.push).toHaveBeenCalledWith({
      params: {
        categoryId: 'category opaque/1',
        productId: 'product-2',
        source: 'category',
      },
      pathname: '/(tabs)/(shop)/product/[productId]',
    });
  });
});
