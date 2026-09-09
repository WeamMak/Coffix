import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { category, commercePage, problem } from './commerceSupport';

it('offers supported category icons and previews the selection before saving', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/catalog/categories', () => Response.json([category]));
  await user.click(await screen.findByRole('button', { name: 'Edit קפה' }));
  const picker = screen.getByRole('combobox', { name: 'Category icon' });
  expect(within(picker).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['', 'coffee', 'coffee-bean', 'capsule', 'settings', 'sparkles', 'wrench']);
  await user.selectOptions(picker, 'capsule');
  expect(screen.getByRole('img', { name: 'Capsules icon preview' })).toBeVisible();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  await user.click(screen.getByRole('button', { name: 'Save category' }));
  await waitFor(() => expect(fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1]?.body).toContain('"icon_key":"capsule"'));
});

it('validates category fields and preserves edits when another admin saved first', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/catalog/categories', (_, init) => init?.method === 'PATCH'
    ? problem('record_changed', 'This record changed. Reload before editing again.') : Response.json([category]));
  await user.click(await screen.findByRole('button', { name: 'Edit קפה' }));
  const slug = screen.getByLabelText('Slug');
  await user.clear(slug); await user.type(slug, 'INVALID SLUG');
  await user.click(screen.getByRole('button', { name: 'Save category' }));
  expect(slug).toBeInvalid();
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  await user.clear(slug); await user.type(slug, 'coffee-new');
  await user.click(screen.getByRole('button', { name: 'Save category' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Reload');
  expect(slug).toHaveValue('coffee-new');
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.body === JSON.stringify({ name_he: 'קפה', slug: 'coffee-new', image_key: null, icon_key: null, sort_order: 0, is_active: true, version: category.version }))).toBe(true));
});

it('requires product data and validates SKU attributes, price and nullable initial stock', async () => {
  const { product, sku } = await import('./commerceSupport');
  const user = userEvent.setup();
  const fetcher = commercePage('/catalog/products/product-1', (url, init) => {
    if (url.pathname.endsWith('/categories')) return Response.json([category]);
    if (url.pathname.endsWith('/machine-models')) return Response.json([]);
    if (init?.method === 'POST') return Response.json(sku);
    return Response.json(product);
  });
  await user.click(await screen.findByRole('button', { name: 'New SKU' }));
  await user.type(screen.getByLabelText('SKU code'), 'NEW-1');
  await user.clear(screen.getByLabelText('Price (agorot)')); await user.type(screen.getByLabelText('Price (agorot)'), '-1');
  await user.click(screen.getByRole('button', { name: 'Save SKU' }));
  expect(screen.getByLabelText('Price (agorot)')).toBeInvalid();
  await user.clear(screen.getByLabelText('Price (agorot)')); await user.type(screen.getByLabelText('Price (agorot)'), '12550');
  await user.clear(screen.getByLabelText('Attributes (JSON)')); await user.type(screen.getByLabelText('Attributes (JSON)'), 'wrong');
  await user.click(screen.getByRole('button', { name: 'Save SKU' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Attributes must be a JSON object with text values');
  await user.clear(screen.getByLabelText('Attributes (JSON)')); await user.type(screen.getByLabelText('Attributes (JSON)'), '{{}');
  await user.click(screen.getByRole('button', { name: 'Save SKU' }));
  await user.click(screen.getByRole('button', { name: 'Apply SKU changes' }));
  await user.click(screen.getByRole('button', { name: 'Confirm apply sku changes' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST' && init.body && JSON.parse(String(init.body)).stock_quantity === null)).toBe(true));
  expect(fetcher.mock.calls.find(([url, init]) => String(url).endsWith('/skus') && init?.method === 'POST')?.[1]?.body).toContain('"price_agorot":12550');
});

it('requires product name, description and type before creating a product', async () => {
  const user = userEvent.setup();
  const fetcher = commercePage('/catalog/products/new', () => Response.json([category]));
  await screen.findByRole('option', { name: category.name_he });
  await user.selectOptions(screen.getByLabelText('Category', { exact: true }), category.id);
  await user.click(screen.getByRole('button', { name: 'Save product' }));
  expect(screen.getByLabelText('Hebrew name')).toBeInvalid();
  await user.type(screen.getByLabelText('Hebrew name'), 'מוצר חדש');
  await user.click(screen.getByRole('button', { name: 'Save product' }));
  expect(screen.getByLabelText('Hebrew description')).toBeInvalid();
  expect(fetcher.mock.calls.filter(([url, init]) => String(url).endsWith('/products') && init?.method === 'POST')).toHaveLength(0);
});

it('reloads the latest SKU after a conflicting price edit', async () => {
  const { product, sku } = await import('./commerceSupport');
  const user = userEvent.setup();
  let conflict = false;
  commercePage('/catalog/products/product-1', (url, init) => {
    if (url.pathname.endsWith('/categories')) return Response.json([category]);
    if (url.pathname.endsWith('/machine-models')) return Response.json([]);
    if (init?.method === 'PATCH') { conflict = true; return problem('record_changed', 'This record changed. Reload before editing again.'); }
    return Response.json(conflict ? { ...product, skus: [{ ...sku, price_agorot: 13500, version: '2026-09-08T13:00:00Z' }] } : product);
  });
  await user.click(await screen.findByRole('button', { name: 'Edit BEANS-1' }));
  await user.clear(screen.getByLabelText('Price (agorot)')); await user.type(screen.getByLabelText('Price (agorot)'), '9900');
  await user.click(screen.getByRole('button', { name: 'Save SKU' }));
  await user.click(screen.getByRole('button', { name: 'Apply SKU changes' }));
  await user.click(screen.getByRole('button', { name: 'Confirm apply sku changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('changed');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: 'Reload SKU and discard edits' }));
  await user.click(await screen.findByRole('button', { name: 'Edit BEANS-1' }));
  expect(screen.getByLabelText('Price (agorot)')).toHaveValue(13500);
});
