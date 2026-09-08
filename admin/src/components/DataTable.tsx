import type { ReactNode } from 'react';
import { ProblemBanner } from './ProblemBanner';

type Column<Row> = { key: string; label: string; render: (row: Row) => ReactNode };

export function DataTable<Row>({ caption, rows, columns, rowKey, loading, error, emptyMessage = 'No records found.' }: {
  caption: string;
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  error?: unknown;
  emptyMessage?: string;
}) {
  if (loading) return <p role="status">Loading {caption.toLowerCase()}…</p>;
  if (error) return <ProblemBanner error={error} />;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={caption}>
    <table>
      <caption>{caption}</caption>
      <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>)
        : <tr><td colSpan={columns.length}>{emptyMessage}</td></tr>}
      </tbody>
    </table>
  </div>;
}
