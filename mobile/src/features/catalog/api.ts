import type { components } from '@coffix/api-client';

import { apiClient } from '../../api/client';
import type {
  ActivitySummary,
  Category,
  Product,
  ProductList,
  ProductListParams,
} from './types';

type Cart = components['schemas']['CartRead'];

function productsPath(params: ProductListParams): string {
  const search = new URLSearchParams();
  if (params.categoryId !== undefined) {
    search.set('category_id', params.categoryId);
  }
  if (params.featured !== undefined) {
    search.set('featured', String(params.featured));
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  if (params.page !== undefined) {
    search.set('page', String(params.page));
  }
  if (params.query !== undefined) {
    search.set('q', params.query);
  }
  const query = search.toString();
  return `/api/v1/catalog/products${query ? `?${query}` : ''}`;
}

export const catalogApi = {
  addToCart(skuId: string, quantity: number): Promise<Cart> {
    return apiClient.request('/api/v1/cart/items', {
      body: { sku_id: skuId, quantity },
      method: 'POST',
    });
  },
  getActivitySummary(): Promise<ActivitySummary> {
    return apiClient.request('/api/v1/users/me/activity-summary');
  },
  getCategories(): Promise<Category[]> {
    return apiClient.request('/api/v1/catalog/categories');
  },
  getProduct(productId: string): Promise<Product> {
    return apiClient.request(
      `/api/v1/catalog/products/${encodeURIComponent(productId)}`,
    );
  },
  getProducts(params: ProductListParams = {}): Promise<ProductList> {
    return apiClient.request(productsPath(params));
  },
};
