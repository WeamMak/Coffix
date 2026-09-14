import type { ReactNode } from 'react';
import { ProblemBanner } from './ProblemBanner';

type Column<Row> = { key: string; label: string; render: (row: Row) => ReactNode };

export function DataTable<Row>({ caption, rows, columns, rowKey, loading, error, emptyMessage = 'לא נמצאו רשומות.' }: {
  caption: string;
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  error?: unknown;
  emptyMessage?: string;
}) {
  if (loading) return <p role="status" className="empty-state">טוענים {caption}…</p>;
  if (error) return <ProblemBanner error={error} />;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
    <table role="table">
      <caption>{caption}</caption>
      <thead role="rowgroup"><tr role="row">{columns.map((column) => <th role="columnheader" key={column.key} scope="col">{column.label}</th>)}</tr></thead>
      <tbody role="rowgroup">{rows.length ? rows.map((row) => <tr role="row" key={rowKey(row)}>{columns.map((column) => <td role="cell" key={column.key}><span className="mobile-cell-label" aria-hidden="true">{column.label}</span><div className="cell-value" dir="auto">{column.render(row)}</div></td>)}</tr>)
        : <tr role="row"><td role="cell" colSpan={columns.length}>{emptyMessage}</td></tr>}
      </tbody>
    </table>
  </div>;
}
