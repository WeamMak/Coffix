import { productTypeLabel } from '../../components/labels';
import { Link } from 'react-router-dom';
import { ActiveFilter, CatalogNav, ListSearch, Pagination, useListFilters } from '../../components/CommerceControls';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { money, useAdminQuery, type Schema } from './api';

export function ProductList() {
  const filters = useListFilters();
  const query = useAdminQuery<Schema['AdminProductPage']>(`/admin/products?${filters.query}`);
  return <section><h1>קטלוג</h1><CatalogNav /><div className="list-panel no-caption">
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)} placeholder="חיפוש לפי שם מוצר או מק״ט" actions={<Link className="button-link" to="/catalog/products/new"><span aria-hidden="true">+ </span>מוצר חדש</Link>}>
      <ActiveFilter value={filters.params.get('active') ?? ''} onChange={(value) => filters.change('active', value)} />
      <label>מוביל<select aria-label="סינון מוצרים מובילים" value={filters.params.get('featured') ?? ''} onChange={(event) => filters.change('featured', event.target.value)}><option value="">כל המוצרים</option><option value="true">מוביל</option><option value="false">לא מוביל</option></select></label>
    </ListSearch>
    <DataTable caption="מוצרים" rows={query.data?.items ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'מוצר', render: (row) => <div className="item-summary"><span><Link dir="auto" to={`/catalog/products/${row.id}`}>{row.name_he}</Link><small><bdi dir="ltr">{row.admin_label_en}</bdi>{row.admin_label_en ? ' · ' : ''}{row.skus.length} מק״טים{row.is_featured ? ' · מוצר מוביל' : ''}</small></span></div> },
      { key: 'type', label: 'סוג', render: (row) => productTypeLabel(row.product_type) },
      { key: 'skus', label: 'מק״ט', render: (row) => row.skus.length === 1 ? <bdi dir="ltr">{row.skus[0].sku_code}</bdi> : `${row.skus.length} מק״טים` },
      { key: 'price', label: 'מחיר', render: (row) => { const prices = row.skus.map((sku) => sku.price_agorot); return prices.length ? <bdi>{Math.min(...prices) === Math.max(...prices) ? money(prices[0]) : `${money(Math.min(...prices))} – ${money(Math.max(...prices))}`}</bdi> : 'טרם נקבע'; } },
      { key: 'stock', label: 'מלאי', render: (row) => row.skus.length === 1 ? row.skus[0].stock_quantity ?? 'ללא הגבלה' : <Link to="/catalog/inventory">מלאי לפי מק״ט</Link> },
      { key: 'active', label: 'פעילות', render: (row) => <StatusBadge label={row.is_active ? 'פעיל' : 'לא פעיל'} tone={row.is_active ? 'success' : 'neutral'} /> },
    ]} />
    <Pagination page={filters.page} hasNext={filters.page * 20 < (query.data?.total ?? 0)} busy={query.isFetching} onPage={filters.setPage} />
  </div></section>;
}
