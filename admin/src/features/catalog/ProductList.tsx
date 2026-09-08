import { Link } from 'react-router-dom';
import { ActiveFilter, CatalogNav, ListSearch, Pagination, useListFilters } from '../../components/CommerceControls';
import { DataTable } from '../../components/DataTable';
import { useAdminQuery, type Schema } from './api';

export function ProductList() {
  const filters = useListFilters();
  const query = useAdminQuery<Schema['AdminProductPage']>(`/admin/products?${filters.query}`);
  return <section><h1>Catalog</h1><CatalogNav /><div className="page-actions"><Link className="button-link" to="/catalog/products/new">New product</Link></div>
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)}>
      <ActiveFilter value={filters.params.get('active') ?? ''} onChange={(value) => filters.change('active', value)} />
      <label>Featured<select aria-label="Featured filter" value={filters.params.get('featured') ?? ''} onChange={(event) => filters.change('featured', event.target.value)}><option value="">All products</option><option value="true">Featured</option><option value="false">Not featured</option></select></label>
    </ListSearch>
    <DataTable caption="Products" rows={query.data?.items ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'Product', render: (row) => <Link dir="auto" to={`/catalog/products/${row.id}`}>{row.name_he}</Link> },
      { key: 'label', label: 'English label', render: (row) => row.admin_label_en ?? '—' },
      { key: 'type', label: 'Type', render: (row) => row.product_type },
      { key: 'skus', label: 'SKUs', render: (row) => row.skus.length },
      { key: 'active', label: 'Visibility', render: (row) => `${row.is_active ? 'Active' : 'Inactive'}${row.is_featured ? ' · Featured' : ''}` },
    ]} />
    <Pagination page={filters.page} hasNext={filters.page * 20 < (query.data?.total ?? 0)} busy={query.isFetching} onPage={filters.setPage} />
  </section>;
}
