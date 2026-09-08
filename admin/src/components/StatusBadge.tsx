export function StatusBadge({ label, tone = 'neutral' }: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return <span className="status-badge" data-tone={tone}>{label}</span>;
}
