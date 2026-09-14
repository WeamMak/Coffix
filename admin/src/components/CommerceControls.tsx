import { NavLink, useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { FormField } from './FormField';

export function CatalogNav() {
  return <nav className="section-nav" aria-label="ניהול הקטלוג"><NavLink to="/catalog" end>מוצרים</NavLink><NavLink to="/catalog/categories">קטגוריות</NavLink><NavLink to="/catalog/inventory">מלאי</NavLink></nav>;
}
export function useListFilters() {
  const [params, setParams] = useSearchParams();
  const parsed = Number(params.get('page') ?? 1);
  const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  function change(name: string, value: string) {
    setParams((previous) => { const next = new URLSearchParams(previous); next.delete('page'); if (value) next.set(name, value); else next.delete(name); return next; });
  }
  const query = new URLSearchParams(params); query.set('page', String(page)); query.set('limit', '20');
  return { params, page, query: query.toString(), change, setPage: (page: number) => setParams((previous) => { const next = new URLSearchParams(previous); next.set('page', String(page)); return next; }) };
}
export function ListSearch({ value, onSearch, children, actions, placeholder = 'חיפוש לפי שם או מזהה' }: { value: string; onSearch: (q: string) => void; children?: ReactNode; actions?: ReactNode; placeholder?: string }) {
  return <form className="list-filters" onSubmit={(event) => { event.preventDefault(); onSearch(String(new FormData(event.currentTarget).get('q') ?? '').trim()); }}>
    <FormField key={value} label="חיפוש" name="q" type="search" placeholder={placeholder} defaultValue={value} maxLength={160} />
    <button type="submit">חיפוש</button>{children}{actions ? <div className="toolbar-actions">{actions}</div> : null}
  </form>;
}
export function ActiveFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="form-field">פעילות<select aria-label="פעילות" value={value} onChange={(event) => onChange(event.target.value)}><option value="">הכול</option><option value="true">פעיל</option><option value="false">לא פעיל</option></select></label>;
}
export function Pagination({ page, hasNext, busy, onPage }: { page: number; hasNext: boolean; busy: boolean; onPage: (page: number) => void }) {
  return <nav aria-label="מעבר בין עמודים" className="pagination"><button disabled={busy || page === 1} onClick={() => onPage(page - 1)}>העמוד הקודם</button><span>עמוד {page}</span><button disabled={busy || !hasNext} onClick={() => onPage(page + 1)}>העמוד הבא</button></nav>;
}
