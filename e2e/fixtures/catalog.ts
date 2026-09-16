import type { APIRequestContext } from '@playwright/test';
import { api, type Schema } from './users';
export async function catalog(request: APIRequestContext, admin: string, stock: number | null = 2) {
  const model: Schema['MachineModelRead'] = await api(request, admin, '/admin/machine-models', { manufacturer: 'Coffix E2E', model_name: 'Deterministic', default_warranty_months: 12 });
  const category = await api(request, admin, '/admin/categories', { name_he: 'מכונות בדיקה', slug: 'e2e-machines' });
  const product = await api(request, admin, '/admin/products', { category_id: category.id, name_he: 'מכונת בדיקה', description_he: 'מכונה לתרחיש בדיקה', product_type: 'machine' });
  const sku: Schema['AdminSkuRead'] = await api(request, admin, `/admin/products/${product.id}/skus`, { sku_code: 'E2E-MACHINE', price_agorot: 10000, stock_quantity: stock, machine_model_id: model.id });
  return { model, category, product, sku };
}
