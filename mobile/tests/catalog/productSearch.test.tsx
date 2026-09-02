import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CategoriesContent } from '../../app/(tabs)/(shop)/categories';
import type { Category, Product } from '../../src/features/catalog/types';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue('access-token'),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

const category: Category = {
  icon_key: 'coffee-bean',
  id: 'category-1',
  image_url: 'https://images.example/beans.jpg',
  is_active: true,
  name_he: 'פולי קפה',
  product_count: 1,
  slug: 'beans',
  sort_order: 1,
};

const product: Product = {
  category_id: category.id,
  created_at: '2026-09-02T10:00:00Z',
  description_he: 'תערובת מקומית',
  id: 'product-1',
  is_active: true,
  is_featured: true,
  media: [],
  name_he: 'פולי קפה ארבל',
  product_type: 'beans',
  skus: [{
    attributes: { weight: '1kg' },
    currency: 'ILS',
    id: 'sku-1',
    is_active: true,
    machine_model_id: null,
    price_agorot: 8900,
    sku_code: 'ARBEL-1KG',
    stock_quantity: 5,
  }],
  updated_at: '2026-09-02T10:00:00Z',
};

function jsonResponse(payload: unknown): Response {
  return {
    headers: new Headers(),
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function renderShop() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CategoriesContent searchDelayMs={0} sessionScope="session-1" />
    </QueryClientProvider>,
  );
}

describe('shop product search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn().mockImplementation((request: string) => {
      const url = new URL(request);
      if (url.pathname.endsWith('/catalog/categories')) {
        return Promise.resolve(jsonResponse([category]));
      }
      return Promise.resolve(jsonResponse({
        items: url.searchParams.get('q') === 'ארבל' ? [product] : [],
        limit: 12,
        page: 1,
        total: url.searchParams.get('q') === 'ארבל' ? 1 : 0,
      }));
    });
  });

  it('searches products and restores categories when cleared', async () => {
    await renderShop();

    expect(await screen.findByTestId('category-grid')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('חיפוש מוצרים'), '  ארבל  ');

    expect(await screen.findByText('פולי קפה ארבל')).toBeOnTheScreen();
    expect(screen.queryByTestId('category-grid')).not.toBeOnTheScreen();
    expect(jest.mocked(globalThis.fetch).mock.calls.some(([request]) => (
      new URL(String(request)).searchParams.get('q') === 'ארבל'
    ))).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('חיפוש מוצרים'), '');
    await waitFor(() => expect(screen.getByTestId('category-grid')).toBeOnTheScreen());
  });
});
