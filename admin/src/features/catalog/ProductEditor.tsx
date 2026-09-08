import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CatalogNav } from '../../components/CommerceControls';
import { DataTable } from '../../components/DataTable';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { money, optionalText, text, useAdminQuery, useCommerceSave, type Schema } from './api';
import { SkuEditor } from './SkuEditor';

type Product = Schema['AdminProductRead'];
export function ProductEditor() {
  const { productId } = useParams();
  const query = useAdminQuery<Product>(`/admin/products/${productId}`, !!productId);
  const [reload, setReload] = useState(0);
  if (productId && query.isPending) return <p role="status">Loading product…</p>;
  if (productId && !query.data) return <ProblemBanner error={query.error} />;
  return <section><h1>{productId ? 'Edit product' : 'New product'}</h1><CatalogNav /><Link to="/catalog">Back to products</Link>
    <ProductForm key={`${productId ?? 'new'}:${reload}`} product={query.data} onReload={async () => { const result = await query.refetch(); if (result.isSuccess) setReload((value) => value + 1); }} />
  </section>;
}
function ProductForm({ product, onReload }: { product?: Product; onReload: () => Promise<void> }) {
  const { client } = useWebSession();
  const navigate = useNavigate();
  const [categorySearch, setCategorySearch] = useState('');
  const categories = useAdminQuery<Schema['AdminCategoryRead'][]>(`/admin/categories?limit=100&q=${encodeURIComponent(categorySearch)}`);
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '');
  const [sku, setSku] = useState<Schema['AdminSkuRead'] | 'new' | null>(null);
  const [savedProduct, setSavedProduct] = useState(product);
  const current = savedProduct;
  const save = useCommerceSave(async (body: Schema['ProductCreate'] | Schema['AdminProductUpdate']) => {
    const result = await client.api.request<Product>(current ? `/admin/products/${current.id}` : '/admin/products', { method: current ? 'PATCH' : 'POST', body });
    setSavedProduct(result);
    if (!current) navigate(`/catalog/products/${result.id}`, { replace: true });
  });
  const skus = useAdminQuery<Product>(`/admin/products/${current?.id}`, !!current);
  return <><form className="editor-panel" onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    save.mutate({ category_id: categoryId, name_he: text(data, 'name_he'), description_he: text(data, 'description_he'), admin_label_en: optionalText(data, 'admin_label_en'), product_type: text(data, 'product_type'), is_featured: data.has('is_featured'), is_active: data.has('is_active'), ...(current ? { version: current.version } : {}) });
  }}><fieldset disabled={save.isPending}>
    <FormField label="Find category" type="search" value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} maxLength={160} />
    <label className="form-field">Category<select aria-label="Category" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Choose a category</option>
      {categoryId && !categories.data?.some((item) => item.id === categoryId) ? <option value={categoryId}>Current category</option> : null}
      {categories.data?.map((item) => <option key={item.id} value={item.id}>{item.name_he}{item.is_active ? '' : ' (Inactive)'}</option>)}
    </select></label><ProblemBanner error={categories.error} />
    <FormField label="Hebrew name" name="name_he" dir="auto" required pattern=".*\S.*" maxLength={160} defaultValue={current?.name_he} />
    <label className="form-field">Hebrew description<textarea aria-label="Hebrew description" name="description_he" dir="auto" required maxLength={5000} defaultValue={current?.description_he} /></label>
    <FormField label="English label" name="admin_label_en" maxLength={160} defaultValue={current?.admin_label_en ?? ''} />
    <FormField label="Product type" name="product_type" required pattern=".*\S.*" maxLength={40} defaultValue={current?.product_type} />
    <label><input type="checkbox" name="is_featured" defaultChecked={current?.is_featured ?? false} /> Featured</label>
    <label><input type="checkbox" name="is_active" defaultChecked={current?.is_active ?? true} /> Active product</label>
    <button className="primary" type="submit">{save.isPending ? 'Saving…' : 'Save product'}</button>
  </fieldset><ProblemBanner error={save.error} />{save.isSuccess ? <p role="status">Product saved.</p> : null}
  {save.isError && current ? <button type="button" onClick={() => void onReload()}>Reload product and discard edits</button> : null}</form>
  {current ? <section className="editor-panel"><h2>SKUs</h2><button onClick={() => setSku('new')}>New SKU</button>
    <DataTable caption="Product SKUs" rows={skus.data?.skus ?? current.skus} error={skus.error} rowKey={(row) => row.id} columns={[
      { key: 'code', label: 'SKU', render: (row) => row.sku_code },
      { key: 'price', label: 'Price', render: (row) => money(row.price_agorot) },
      { key: 'stock', label: 'Stock', render: (row) => row.stock_quantity ?? 'Unlimited' },
      { key: 'active', label: 'Visibility', render: (row) => row.is_active ? 'Active' : 'Inactive' },
      { key: 'edit', label: 'Actions', render: (row) => <button onClick={() => setSku(row)} aria-label={`Edit ${row.sku_code}`}>Edit SKU</button> },
    ]} /><Link to="/catalog/inventory">Adjust stock and view reservations</Link>
    {sku ? <SkuEditor key={sku === 'new' ? 'new' : `${sku.id}:${sku.version}`} productId={current.id} sku={sku === 'new' ? undefined : sku} onClose={() => setSku(null)} onReload={async () => { const result = await skus.refetch(); if (result.isSuccess) setSku(null); }} /> : null}
  </section> : null}</>;
}
