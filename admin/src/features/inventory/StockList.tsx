import { useState } from 'react';
import { ActiveFilter, CatalogNav, ListSearch, Pagination, useListFilters } from '../../components/CommerceControls';
import { DataTable } from '../../components/DataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { useAdminQuery, type Schema } from '../catalog/api';
import { StockAdjustment } from './StockAdjustment';

export function StockList() {
  const filters = useListFilters();
  const query = useAdminQuery<Schema['InventoryRead'][]>(`/admin/inventory?${filters.query}`, true, true);
  const [editing, setEditing] = useState<Schema['InventoryRead'] | null>(null);
  return <section><h1>מלאי</h1><CatalogNav /><div className="list-panel no-caption">
    <div className="panel-heading"><h2>מלאי לפי מק״ט</h2><button disabled={query.isFetching} onClick={() => void query.refetch()}>רענון מלאי</button></div>
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)}><ActiveFilter value={filters.params.get('active') ?? ''} onChange={(value) => filters.change('active', value)} /></ListSearch>
    <DataTable caption="מלאי" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'code', label: 'מק״ט', render: (row) => <bdi dir="ltr">{row.sku_code}</bdi> },
      { key: 'name', label: 'מוצר', render: (row) => <span dir="auto">{row.product_name_he}</span> },
      { key: 'total', label: 'מלאי כולל', render: (row) => row.stock_quantity ?? 'ללא הגבלה' },
      { key: 'reserved', label: 'שמור בעגלות', render: (row) => row.reserved_quantity },
      { key: 'available', label: 'זמין', render: (row) => row.available_quantity ?? 'ללא הגבלה' },
      { key: 'active', label: 'פעילות', render: (row) => <StatusBadge label={row.is_active ? 'פעיל' : 'לא פעיל'} tone={row.is_active ? 'success' : 'neutral'} /> },
      { key: 'edit', label: 'פעולות', render: (row) => <button aria-label={`עדכון ${row.sku_code}`} onClick={() => setEditing(row)}>עדכון מלאי</button> },
    ]} />
    <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
    </div><p className="page-description">מלאי מנוהל כולל כמויות השמורות בעגלות. למלאי ללא הגבלה אין מגבלת כמות.</p>
    {editing ? <StockAdjustment key={editing.id} stock={editing} onClose={() => setEditing(null)} onReload={async () => { const result = await query.refetch(); if (result.isSuccess) setEditing(null); }} /> : null}
  </section>;
}
