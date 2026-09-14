import { useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CatalogNav } from '../../components/CommerceControls';
import { DataTable } from '../../components/DataTable';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { useWebSession } from '../auth/useWebSession';
import { dateTime, money, optionalText, text, useAdminQuery, useCommerceSave, type Schema } from './api';
import { SkuEditor } from './SkuEditor';

type Product = Schema['AdminProductRead'];
export function ProductEditor() {
  const { productId } = useParams();
  const query = useAdminQuery<Product>(`/admin/products/${productId}`, !!productId);
  const [reload, setReload] = useState(0);
  if (productId && query.isPending) return <p role="status">טוענים את המוצר…</p>;
  if (productId && !query.data) return <ProblemBanner error={query.error} />;
  return <section><h1>{productId ? 'עריכת מוצר' : 'מוצר חדש'}</h1><CatalogNav /><Link to="/catalog">חזרה למוצרים</Link>
    <ProductForm key={`${productId ?? 'new'}:${reload}`} product={query.data} onReload={async () => { const result = await query.refetch(); if (result.isSuccess) setReload((value) => value + 1); }} />
  </section>;
}
function ProductForm({ product, onReload }: { product?: Product; onReload: () => Promise<void> }) {
  const { client } = useWebSession();
  const formId = useId();
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
  return <><div className="record-layout product-layout"><div className="record-primary"><form id={formId} className="editor-panel" onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    save.mutate({ category_id: categoryId, name_he: text(data, 'name_he'), description_he: text(data, 'description_he'), admin_label_en: optionalText(data, 'admin_label_en'), product_type: text(data, 'product_type'), is_featured: data.has('is_featured'), is_active: data.has('is_active'), ...(current ? { version: current.version } : {}) });
  }}><h2>פרטי המוצר</h2><fieldset disabled={save.isPending}>
    <FormField label="שם בעברית" name="name_he" dir="auto" required pattern=".*\S.*" maxLength={160} defaultValue={current?.name_he} />
    <label className="form-field">תיאור בעברית<textarea aria-label="תיאור בעברית" name="description_he" dir="auto" required maxLength={5000} defaultValue={current?.description_he} /></label>
    <div className="form-grid"><FormField label="תווית באנגלית" name="admin_label_en" maxLength={160} defaultValue={current?.admin_label_en ?? ''} />
    <FormField label="סוג מוצר" name="product_type" required pattern=".*\S.*" maxLength={40} defaultValue={current?.product_type} /></div>
    <div className="form-grid"><FormField label="חיפוש קטגוריה" type="search" value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} maxLength={160} />
    <label className="form-field">קטגוריה<select aria-label="קטגוריה" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">בחרו קטגוריה</option>
      {categoryId && !categories.data?.some((item) => item.id === categoryId) ? <option value={categoryId}>הקטגוריה הנוכחית</option> : null}
      {categories.data?.map((item) => <option key={item.id} value={item.id}>{item.name_he}{item.is_active ? '' : ' (לא פעיל)'}</option>)}
    </select></label></div><ProblemBanner error={categories.error} />
  </fieldset></form>
  {current ? <section className="editor-panel"><h2>מק״טים</h2><button onClick={() => setSku('new')}>מק״ט חדש</button>
    <DataTable caption="מק״טים של המוצר" rows={skus.data?.skus ?? current.skus} error={skus.error} rowKey={(row) => row.id} columns={[
      { key: 'code', label: 'מק״ט', render: (row) => <bdi dir="ltr">{row.sku_code}</bdi> },
      { key: 'price', label: 'מחיר', render: (row) => money(row.price_agorot) },
      { key: 'stock', label: 'מלאי', render: (row) => row.stock_quantity ?? 'ללא הגבלה' },
      { key: 'active', label: 'פעילות', render: (row) => row.is_active ? 'פעיל' : 'לא פעיל' },
      { key: 'edit', label: 'פעולות', render: (row) => <button onClick={() => setSku(row)} aria-label={`עריכת ${row.sku_code}`}>עריכת מק״ט</button> },
    ]} /><Link to="/catalog/inventory">עדכון מלאי וצפייה בכמות השמורה</Link>
    {sku ? <SkuEditor key={sku === 'new' ? 'new' : `${sku.id}:${sku.version}`} productId={current.id} sku={sku === 'new' ? undefined : sku} onClose={() => setSku(null)} onReload={async () => { const result = await skus.refetch(); if (result.isSuccess) setSku(null); }} /> : null}
  </section> : null}</div><div className="record-support">
    <section className="editor-panel"><h2>סטטוס ופרסום</h2><fieldset disabled={save.isPending}>
      <label><input type="checkbox" form={formId} name="is_active" defaultChecked={current?.is_active ?? true} /> מוצר פעיל</label>
      <label><input type="checkbox" form={formId} name="is_featured" defaultChecked={current?.is_featured ?? false} /> מוביל</label>
    </fieldset>{current ? <p className="muted">עודכן לאחרונה: {dateTime(current.version)}</p> : null}</section>
    <ProblemBanner error={save.error} />
    {save.isError && current ? <button type="button" onClick={() => void onReload()}>טעינת המוצר מחדש וביטול השינויים</button> : null}
  </div></div><div className="save-bar"><span className="save-status">{save.isSuccess ? <span role="status">המוצר נשמר.</span> : 'בדקו את פרטי המוצר לפני השמירה'}</span>
    <Link className="secondary-link" to="/catalog">ביטול</Link><button className="primary" type="submit" form={formId} disabled={save.isPending}>{save.isPending ? 'שומרים…' : 'שמירת מוצר'}</button>
  </div></>;
}
