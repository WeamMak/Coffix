import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { HomeContent } from '../../app/(tabs)/(home)/index';
import type { Product } from '../../src/features/catalog/types';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue('access-token'),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

const featuredProduct: Product = {
  category_id: 'category-1',
  created_at: '2026-09-02T10:00:00Z',
  description_he: 'תערובת עגולה עם שוקולד',
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

function response(payload: unknown, status = 200): Response {
  return {
    headers: new Headers(),
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function renderHome(activityStatus = 200, activity: unknown = {
  active_order: { id: 'order-1', order_number: 'CFX-101', state: 'paid' },
  active_service_request: { id: 'service-1', reference: 'SR-202', state: 'received' },
  customer_id: 'customer-1',
  display_name: 'מאיה',
}) {
  globalThis.fetch = jest.fn().mockImplementation((request: string) => {
    const url = new URL(request);
    if (url.pathname.endsWith('/activity-summary')) {
      return Promise.resolve(response(activity, activityStatus));
    }
    if (url.pathname.endsWith('/categories')) {
      return Promise.resolve(response([{
        icon_key: 'coffee-bean', id: 'category-1', image_url: null, is_active: true,
        name_he: 'פולי קפה', product_count: 1, slug: 'beans', sort_order: 1,
      }]));
    }
    return Promise.resolve(response({ items: [featuredProduct], limit: 6, page: 1, total: 1 }));
  });
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HomeContent sessionScope="session-1" />
    </QueryClientProvider>,
  );
}

describe('Editorial authenticated home', () => {
  it('renders customer activity and catalog hierarchy', async () => {
    await renderHome();

    expect(await screen.findByText('שלום, מאיה')).toBeOnTheScreen();
    expect(screen.getByText('הזמנה פעילה')).toBeOnTheScreen();
    expect(screen.getByText('שירות')).toBeOnTheScreen();
    expect(screen.getByText('שולם')).toBeOnTheScreen();
    expect(screen.getByText('התקבל')).toBeOnTheScreen();
    expect(screen.getByText('קטגוריות')).toBeOnTheScreen();
    expect(screen.getByText('מוצרים מובילים')).toBeOnTheScreen();
    expect(screen.getByText('תערובת הבית')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'פולי קפה, 1 פריטים' })).toHaveStyle({
      height: 82,
    });
    expect(screen.getByRole('button', { name: /תערובת הבית/ })).toHaveStyle({ width: 176 });
    expect(screen.getByText('המכונה שלך עייפה?')).toBeOnTheScreen();
    expect(screen.getByText('נבוא לאסוף היום.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'בקשת שירות' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: /תערובת הבית/ }));
    expect(router.push).toHaveBeenCalledWith({
      params: { productId: 'product-1', source: 'home' },
      pathname: '/(tabs)/(shop)/product/[productId]',
    });
  });

  it('keeps catalog visible when activity fails', async () => {
    await renderHome(500, { code: 'internal_error' });

    expect(await screen.findByRole('button', { name: 'פולי קפה, 1 פריטים' })).toBeOnTheScreen();
    expect(screen.getByText('תערובת הבית')).toBeOnTheScreen();
    expect(screen.getByText('לא הצלחנו לטעון את הפעילות')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'ניסיון נוסף' })).toHaveLength(1);
  });

  it('collapses absent activity instead of showing an error', async () => {
    await renderHome(200, {
      active_order: null,
      active_service_request: null,
      customer_id: 'customer-1',
      display_name: null,
    });

    expect(await screen.findByText('תערובת הבית')).toBeOnTheScreen();
    expect(screen.queryByText('הזמנה פעילה')).not.toBeOnTheScreen();
    expect(screen.queryByText('לא הצלחנו לטעון את הפעילות')).not.toBeOnTheScreen();
  });
});
