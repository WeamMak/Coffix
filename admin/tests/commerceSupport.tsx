import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { createWebClient } from '../src/api/client';
import { WebSessionProvider } from '../src/features/auth/useWebSession';
import { AppRoutes } from '../src/router';

export const category = { id: 'cat-1', name_he: 'קפה', slug: 'coffee', image_key: null, icon_key: null, sort_order: 0, is_active: true, version: '2026-09-08T12:00:00.123456Z' };
export const sku = { id: 'sku-1', sku_code: 'BEANS-1', attributes: { weight: '1kg' }, price_agorot: 8900, currency: 'ILS', stock_quantity: null, is_active: true, machine_model_id: null, version: category.version };
export const product = { id: 'product-1', category_id: category.id, name_he: 'פולים', description_he: 'קפה טרי', admin_label_en: 'Beans', product_type: 'beans', is_featured: false, is_active: true, skus: [sku], version: category.version, created_at: category.version, updated_at: category.version };
export const stock = { id: sku.id, sku_code: sku.sku_code, product_name_he: product.name_he, stock_quantity: 10, reserved_quantity: 3, available_quantity: 7, is_active: true };
export const order = { id: 'order-1', order_number: 'CFX-10001', state: 'paid', total_agorot: 11900, subtotal_agorot: 8900, shipping_agorot: 3000, currency: 'ILS', created_at: category.version, payment_deadline: category.version, items: [{ id: 'item-1', sku_id: sku.id, product_id: product.id, product_name_he: product.name_he, sku_code: sku.sku_code, attributes: sku.attributes, unit_price_agorot: 8900, quantity: 1, line_total_agorot: 8900, currency: 'ILS', machine_model_id: null }], address: { recipient_name: 'Test Customer', phone_e164: '+972500000003', street: 'Coffee', building: '1', apartment: null, city: 'Tel Aviv', postal_code: null, country: 'IL' }, history: [{ from_state: 'pending_payment', to_state: 'paid', source: 'provider', reason: null, created_at: category.version }], shipment: null, allowed_actions: ['process', 'refund'], refund: null };
export function commercePage(path: string, handler: (url: URL, init?: RequestInit) => Response | Promise<Response>, role = 'admin') {
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/v1/auth/web/refresh') return Response.json({ access_token: 'test', user_id: 'admin-1', role });
    return handler(url, init);
  });
  const client = createWebClient({ baseUrl: '/api/v1', fetch: fetcher });
  render(<WebSessionProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></WebSessionProvider>);
  return fetcher;
}
export function problem(code: string, title: string) { return Response.json({ code, title, correlationId: 'ref-26' }, { status: 409 }); }
