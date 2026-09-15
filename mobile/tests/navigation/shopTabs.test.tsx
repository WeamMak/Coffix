import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Stack } from 'expo-router/js-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TabsLayout from '../../app/(tabs)/_layout';
import HomeLayout from '../../app/(tabs)/(home)/_layout';
import HomeScreen from '../../app/(tabs)/(home)';
import ShopLayout from '../../app/(tabs)/(shop)/_layout';
import ShopScreen from '../../app/(tabs)/(shop)';
import ProductListScreen from '../../app/(tabs)/(shop)/products/[categoryId]';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue('access-token'),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockSession = { status: 'authenticated', sessionScope: 'session-1', logout: jest.fn() };
jest.mock('../../src/features/auth/useSession', () => ({ useSession: () => mockSession }));

const category = {
  icon_key: 'coffee-bean', id: 'category-1', image_url: null, is_active: true,
  name_he: 'פולי קפה', product_count: 1, slug: 'beans', sort_order: 1,
};
const product = {
  category_id: category.id,
  created_at: '2026-09-02T10:00:00Z',
  description_he: 'תערובת עגולה',
  id: 'product-1',
  is_active: true,
  is_featured: true,
  media: [],
  name_he: 'תערובת הבית',
  product_type: 'beans',
  skus: [{
    attributes: { weight: '1kg' }, currency: 'ILS', id: 'sku-1', is_active: true,
    machine_model_id: null, price_agorot: 6800, sku_code: 'HOME', stock_quantity: null,
  }],
  updated_at: '2026-09-02T10:00:00Z',
};

function response(payload: unknown): Response {
  return {
    headers: new Headers(), ok: true, status: 200,
    text: async () => JSON.stringify(payload),
  } as Response;
}

it('returns a Home category visit to the Shop root and keeps the Store tab there', async () => {
  globalThis.fetch = jest.fn(async (request: RequestInfo | URL) => {
    const url = new URL(String(request));
    if (url.pathname.endsWith('/activity-summary')) {
      return response({ active_order: null, active_service_request: null, customer_id: 'customer-1', display_name: 'מאיה' });
    }
    if (url.pathname.endsWith('/catalog/categories')) return response([category]);
    if (url.pathname.endsWith('/cart')) {
      return response({
        currency: 'ILS', expires_at: '2099-09-03T11:00:00Z', id: 'cart-1', items: [],
        last_activity_at: '2026-09-03T10:00:00Z', status: 'active', subtotal_agorot: 0,
        total_quantity: 0, version: 1,
      });
    }
    return response({ items: [product], limit: 12, page: 1, total: 1 });
  });
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  await renderRouter({
    _layout: () => (
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      </SafeAreaProvider>
    ),
    '(tabs)/_layout': TabsLayout,
    '(tabs)/(home)/_layout': HomeLayout,
    '(tabs)/(home)/index': HomeScreen,
    '(tabs)/(shop)/_layout': ShopLayout,
    '(tabs)/(shop)/index': ShopScreen,
    '(tabs)/(shop)/categories': ShopScreen,
    '(tabs)/(shop)/products/[categoryId]': ProductListScreen,
    '(tabs)/(shop)/product/[productId]': () => null,
    '(tabs)/(shop)/cart': () => null,
    '(tabs)/(shop)/checkout': () => null,
    '(tabs)/(shop)/payment': () => null,
    '(tabs)/(shop)/confirmation': () => null,
    '(tabs)/(service)/index': () => null,
    '(tabs)/(orders)/index': () => null,
    '(tabs)/(profile)/index': () => null,
  }, { initialUrl: '/(tabs)/(home)' });

  await fireEvent.press(await screen.findByRole('button', { name: 'פולי קפה, 1 פריטים' }));
  expect(await screen.findByTestId('category-title')).toHaveTextContent('פולי קפה');
  await fireEvent.press(screen.getByRole('button', { name: 'חזרה' }));
  expect(await screen.findByText('לעיין לפי קטגוריה')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('tab', { name: 'בית' }));
  await fireEvent.press(screen.getByRole('tab', { name: 'חנות' }));
  expect(await screen.findByText('לעיין לפי קטגוריה')).toBeOnTheScreen();
});
