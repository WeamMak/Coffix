import type { APIRequestContext } from '@playwright/test';
import { api, type Schema } from './users';
export const address = { recipient_name: 'לקוח בדיקה', phone: '0500000003', street: 'הרצל', building: '1', city: 'חיפה', country: 'IL' };
export async function checkout(request: APIRequestContext, customer: string, sku: string, key = 'checkout-one') {
  await api(request, customer, '/cart/items', { sku_id: sku, quantity: 1 });
  const cart: Schema['CartRead'] = await api(request, customer, '/cart');
  return api(request, customer, '/checkout', { address, expected_shipping_agorot: cart.shipping_agorot }, 'POST', key);
}
