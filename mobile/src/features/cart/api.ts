import type { components } from '@coffix/api-client';

import { apiClient } from '../../api/client';

export type Cart = components['schemas']['CartRead'];
export type CartItem = components['schemas']['CartItemRead'];
export type CheckoutInput = components['schemas']['CheckoutRequest'];
export type Checkout = components['schemas']['CheckoutRead'];
export type Order = components['schemas']['OrderRead'];

export const cartApi = {
  addItem(skuId: string, quantity: number): Promise<Cart> {
    return apiClient.request('/api/v1/cart/items', {
      body: { sku_id: skuId, quantity },
      method: 'POST',
    });
  },
  checkout(input: CheckoutInput, idempotencyKey: string): Promise<Checkout> {
    return apiClient.request('/api/v1/checkout', {
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
      method: 'POST',
    });
  },
  get(): Promise<Cart> {
    return apiClient.request('/api/v1/cart');
  },
  getOrder(orderId: string): Promise<Order> {
    return apiClient.request(`/api/v1/orders/${encodeURIComponent(orderId)}`);
  },
  removeItem(skuId: string): Promise<Cart> {
    return apiClient.request(
      `/api/v1/cart/items/${encodeURIComponent(skuId)}`,
      { method: 'DELETE' },
    );
  },
  setItem(skuId: string, quantity: number): Promise<Cart> {
    return apiClient.request(
      `/api/v1/cart/items/${encodeURIComponent(skuId)}`,
      { body: { quantity }, method: 'PUT' },
    );
  },
};
