import { useState } from 'react';
import { ActiveFilter, CatalogNav, ListSearch, Pagination, useListFilters } from '../../components/CommerceControls';
import { DataTable } from '../../components/DataTable';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { IconPicker, categoryIcons } from '../../components/IconPicker';
import { useWebSession } from '../auth/useWebSession';
import { optionalText, text, useAdminQuery, useCommerceSave, type Schema } from './api';

type Category = Schema['AdminCategoryRead'];
export function CategoryList() {
  const filters = useListFilters();
  const query = useAdminQuery<Category[]>(`/admin/categories?${filters.query}`);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  return <section><h1>Categories</h1><CatalogNav />
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)}><ActiveFilter value={filters.params.get('active') ?? ''} onChange={(value) => filters.change('active', value)} /></ListSearch>
    <button onClick={() => setEditing('new')}>New category</button>
    <DataTable caption="Categories" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'Hebrew name', render: (row) => <span dir="auto">{row.name_he}</span> },
      { key: 'slug', label: 'Slug', render: (row) => row.slug },
      { key: 'active', label: 'Visibility', render: (row) => row.is_active ? 'Active' : 'Inactive' },
      { key: 'edit', label: 'Actions', render: (row) => <button onClick={() => setEditing(row)} aria-label={`Edit ${row.name_he}`}>Edit</button> },
    ]} />
    <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
    {editing ? <CategoryEditor key={editing === 'new' ? 'new' : `${editing.id}:${editing.version}`} category={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onReload={async () => { await query.refetch(); setEditing(null); }} /> : null}
  </section>;
}
function CategoryEditor({ category, onClose, onReload }: { category?: Category; onClose: () => void; onReload: () => Promise<void> }) {
  const { client } = useWebSession();
  const save = useCommerceSave((body: Schema['CategoryCreate'] | Schema['AdminCategoryUpdate']) => client.api.request(category ? `/admin/categories/${category.id}` : '/admin/categories', { method: category ? 'PATCH' : 'POST', body }), onClose);
  return <section className="editor-panel"><h2>{category ? `Edit ${category.name_he}` : 'New category'}</h2><form onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    save.mutate({ name_he: text(data, 'name_he'), slug: text(data, 'slug'), image_key: optionalText(data, 'image_key'), icon_key: optionalText(data, 'icon_key'), sort_order: Number(data.get('sort_order')), is_active: data.has('is_active'), ...(category ? { version: category.version } : {}) });
  }}><fieldset disabled={save.isPending}>
    <FormField label="Hebrew name" dir="auto" name="name_he" required pattern=".*\S.*" maxLength={120} defaultValue={category?.name_he} />
    <FormField label="Slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} defaultValue={category?.slug} />
    <FormField label="Image key" name="image_key" maxLength={512} defaultValue={category?.image_key ?? ''} />
    <IconPicker label="Category icon" name="icon_key" choices={categoryIcons} initialValue={category?.icon_key} allowNone />
    <FormField label="Sort order" name="sort_order" type="number" required min={0} max={2147483647} step={1} defaultValue={category?.sort_order ?? 0} />
    <label><input type="checkbox" name="is_active" defaultChecked={category?.is_active ?? true} /> Active</label>
    <button type="submit" className="primary">{save.isPending ? 'Saving…' : 'Save category'}</button><button type="button" onClick={onClose}>Close editor</button>
    </fieldset><ProblemBanner error={save.error} />{save.isError && category ? <button type="button" onClick={() => void onReload()}>Reload categories and discard edits</button> : null}
  </form></section>;
}
