import { useState } from 'react';
import { ActiveFilter, CatalogNav, ListSearch, Pagination, useListFilters } from '../../components/CommerceControls';
import { DataTable } from '../../components/DataTable';
import { FormField } from '../../components/FormField';
import { ProblemBanner } from '../../components/ProblemBanner';
import { StatusBadge } from '../../components/StatusBadge';
import { IconPicker, categoryIcons } from '../../components/IconPicker';
import { useWebSession } from '../auth/useWebSession';
import { optionalText, text, useAdminQuery, useCommerceSave, type Schema } from './api';

type Category = Schema['AdminCategoryRead'];
export function CategoryList() {
  const filters = useListFilters();
  const query = useAdminQuery<Category[]>(`/admin/categories?${filters.query}`);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  return <section><h1>קטגוריות</h1><CatalogNav /><div className={editing ? 'list-editor-layout' : undefined}><div className="list-panel no-caption">
    <div className="panel-heading"><h2>קטגוריות</h2><button className="primary" onClick={() => setEditing('new')}>קטגוריה חדשה</button></div>
    <ListSearch value={filters.params.get('q') ?? ''} onSearch={(value) => filters.change('q', value)}><ActiveFilter value={filters.params.get('active') ?? ''} onChange={(value) => filters.change('active', value)} /></ListSearch>
    <DataTable caption="קטגוריות" rows={query.data ?? []} loading={query.isPending} error={query.error} rowKey={(row) => row.id} columns={[
      { key: 'name', label: 'שם בעברית', render: (row) => <span dir="auto">{row.name_he}</span> },
      { key: 'slug', label: 'מזהה קטגוריה', render: (row) => <bdi dir="ltr">{row.slug}</bdi> },
      { key: 'sort', label: 'סדר תצוגה', render: (row) => row.sort_order },
      { key: 'active', label: 'פעילות', render: (row) => <StatusBadge label={row.is_active ? 'פעיל' : 'לא פעיל'} tone={row.is_active ? 'success' : 'neutral'} /> },
      { key: 'edit', label: 'פעולות', render: (row) => <button onClick={() => setEditing(row)} aria-label={`עריכת ${row.name_he}`}>עריכה</button> },
    ]} />
    <Pagination page={filters.page} hasNext={query.data?.length === 20} busy={query.isFetching} onPage={filters.setPage} />
    </div>
    {editing ? <CategoryEditor key={editing === 'new' ? 'new' : `${editing.id}:${editing.version}`} category={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onReload={async () => { await query.refetch(); setEditing(null); }} /> : null}
  </div></section>;
}
function CategoryEditor({ category, onClose, onReload }: { category?: Category; onClose: () => void; onReload: () => Promise<void> }) {
  const { client } = useWebSession();
  const save = useCommerceSave((body: Schema['CategoryCreate'] | Schema['AdminCategoryUpdate']) => client.api.request(category ? `/admin/categories/${category.id}` : '/admin/categories', { method: category ? 'PATCH' : 'POST', body }), onClose);
  return <section className="editor-panel"><h2>{category ? `עריכת ${category.name_he}` : 'קטגוריה חדשה'}</h2><form onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    save.mutate({ name_he: text(data, 'name_he'), slug: text(data, 'slug'), image_key: optionalText(data, 'image_key'), icon_key: optionalText(data, 'icon_key'), sort_order: Number(data.get('sort_order')), is_active: data.has('is_active'), ...(category ? { version: category.version } : {}) });
  }}><fieldset disabled={save.isPending}>
    <FormField label="שם בעברית" dir="auto" name="name_he" required pattern=".*\S.*" maxLength={120} defaultValue={category?.name_he} />
    <div className="form-grid"><FormField label="מזהה קטגוריה" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} defaultValue={category?.slug} />
    <FormField label="סדר תצוגה" name="sort_order" type="number" required min={0} max={2147483647} step={1} defaultValue={category?.sort_order ?? 0} /></div>
    <FormField label="מפתח תמונה" name="image_key" maxLength={512} defaultValue={category?.image_key ?? ''} />
    <IconPicker label="סמל קטגוריה" name="icon_key" choices={categoryIcons} initialValue={category?.icon_key} allowNone />
    <label><input type="checkbox" name="is_active" defaultChecked={category?.is_active ?? true} />  פעיל</label>
    <div className="page-actions"><button type="submit" className="primary">{save.isPending ? 'שומרים…' : 'שמירת קטגוריה'}</button><button type="button" onClick={onClose}>סגירת העורך</button></div>
    </fieldset><ProblemBanner error={save.error} />{save.isError && category ? <button type="button" onClick={() => void onReload()}>טעינת הקטגוריות מחדש וביטול השינויים</button> : null}
  </form></section>;
}
