import * as SecureStore from 'expo-secure-store';

import { catalogApi } from '../../src/features/catalog/api';
import {
  firstSellableSku,
  formatIls,
  maximumQuantity,
  productImage,
  type Product,
} from '../../src/features/catalog/types';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue('access-token'),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

function response(payload: unknown): Response {
  return {
    headers: new Headers(),
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  } as Response;
}

const product: Product = {
  category_id: 'category-1',
  created_at: '2026-09-02T10:00:00Z',
  description_he: 'תערובת הבית',
  id: 'product-1',
  is_active: true,
  is_featured: true,
  media: [{
    alt_text_he: 'שקית פולי קפה',
    id: 'media-1',
    media_type: 'image/jpeg',
    sku_id: null,
    sort_order: 1,
    url: 'https://images.example/coffee.jpg',
  }],
  name_he: 'פולי קפה הבית',
  product_type: 'beans',
  skus: [
    {
      attributes: { weight: '1kg' },
      currency: 'ILS',
      id: 'sku-inactive',
      is_active: false,
      machine_model_id: null,
      price_agorot: 7000,
      sku_code: 'OLD',
      stock_quantity: 4,
    },
    {
      attributes: { weight: '1kg' },
      currency: 'ILS',
      id: 'sku-active',
      is_active: true,
      machine_model_id: null,
      price_agorot: 7250,
      sku_code: 'CURRENT',
      stock_quantity: 3,
    },
  ],
  updated_at: '2026-09-02T10:00:00Z',
};

describe('catalog API boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('access-token');
  });

  it('encodes only supported product-list parameters', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response({
      items: [], limit: 12, page: 2, total: 0,
    }));

    await catalogApi.getProducts({
      categoryId: 'category 1',
      featured: true,
      limit: 12,
      page: 2,
      query: 'ארבל',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/v1\/catalog\/products\?category_id=category\+1&featured=true&limit=12&page=2&q=%D7%90%D7%A8%D7%91%D7%9C$/,
      ),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('submits only SKU identity and desired quantity to the cart', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response({ items: [] }));

    await catalogApi.addToCart('sku-active', 3);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/cart\/items$/),
      expect.objectContaining({
        body: JSON.stringify({ sku_id: 'sku-active', quantity: 3 }),
        method: 'POST',
      }),
    );
  });
});

describe('catalog presentation rules', () => {
  it('chooses the first active in-stock SKU and respects quantity limits', () => {
    const selected = firstSellableSku(product);

    expect(selected?.id).toBe('sku-active');
    expect(selected && maximumQuantity(selected)).toBe(3);
    expect(maximumQuantity({ ...product.skus[1]!, stock_quantity: null })).toBe(99);
  });

  it('uses server media and formats agorot without floating-point authority', () => {
    expect(productImage(product)).toEqual({
      alt: 'שקית פולי קפה',
      url: 'https://images.example/coffee.jpg',
    });
    expect(formatIls(7250)).toBe('₪72.50');
  });
});
