import { useState } from 'react';
import { ActiveFilter, CatalogNav, ListSearch, Pagination, useListFilters } from '../../components/CommerceControls';
import { DataTable } from '../../components/DataTable';
import { useAdminQuery, type Schema } from '../catalog/api';
import { StockAdjustment } from './StockAdjustment';

export function StockList() {
  const filters = useListFilters();
  const query = useAdminQuery<Schema['InventoryRead'][]>(`/admin/inventory?${filters.query}`, true, true);
  const [editing, setEditing] = useState<Schema['InventoryRead'] | null>(null);
  return <section><h1>Inventory</h1><CatalogNav /><p>Tracked stock includes active reservations. Unlimited stock has no quantity limit.</p>
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)}><ActiveFilter value={filters.params.get('active') ?? ''} onChange={(value) => filters.change('active', value)} /></ListSearch>
    <button disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh inventory</button>
    <DataTable caption="Inventory" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'code', label: 'SKU', render: (row) => row.sku_code },
      { key: 'name', label: 'Product', render: (row) => <span dir="auto">{row.product_name_he}</span> },
      { key: 'total', label: 'Total stock', render: (row) => row.stock_quantity ?? 'Unlimited' },
      { key: 'reserved', label: 'Reserved', render: (row) => row.reserved_quantity },
      { key: 'available', label: 'Available', render: (row) => row.available_quantity ?? 'Unlimited' },
      { key: 'active', label: 'Visibility', render: (row) => row.is_active ? 'Active' : 'Inactive' },
      { key: 'edit', label: 'Actions', render: (row) => <button aria-label={`Adjust ${row.sku_code}`} onClick={() => setEditing(row)}>Adjust stock</button> },
    ]} />
    <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
    {editing ? <StockAdjustment key={editing.id} stock={editing} onClose={() => setEditing(null)} onReload={async () => { const result = await query.refetch(); if (result.isSuccess) setEditing(null); }} /> : null}
  </section>;
}
