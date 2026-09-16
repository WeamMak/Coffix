import { expect } from '@playwright/test';
import { actors, api, call, login, test } from '../fixtures/users';
import { catalog } from '../fixtures/catalog';
import { apiLoad } from './api';
import { inventoryLoad } from './inventory';

test('normal API p95 is below two seconds for 10 clients and 500 reads', async ({ request }) => {
  const a = await actors(request);
  await catalog(request, a.admin);
  const paths = ['/catalog/categories', '/catalog/products', '/cart', '/orders'];
  const result = await apiLoad(async index => {
    await api(request, a.customer, paths[index % paths.length]);
  });
  console.log('API load:', JSON.stringify(result));
});

test('sixteen concurrent customers reserve exactly five tracked units', async ({ request }) => {
  const a = await actors(request);
  const { sku } = await catalog(request, a.admin, 5);
  const customers = [a.customer, a.other];
  // Stay within the real 20-request OTP limit; do not disable rate limiting.
  for (let index = 5; index < 19; index++) {
    const token = (await login(request, `05000000${String(index).padStart(2, '0')}`)).access_token;
    await api(request, token, '/users/me', { display_name: `לקוח עומס ${index}` }, 'PATCH');
    customers.push(token);
  }
  const result = await inventoryLoad(customers.map(token => async () => {
    const response = await call(request, token, '/cart/items', { sku_id: sku.id, quantity: 1 });
    expect([201, 409], await response.text()).toContain(response.status());
    if (response.status() === 409) expect((await response.json()).code).toBe('INSUFFICIENT_STOCK');
    return response.status();
  }), 5);
  expect((await api(request, a.admin, '/admin/inventory'))[0]).toMatchObject({
    stock_quantity: 5, reserved_quantity: 5, available_quantity: 0,
  });
  console.log('Inventory load:', JSON.stringify(result));
});
