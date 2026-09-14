const tones: Record<string, 'success' | 'warning' | 'danger'> = {
  'שולמה': 'success', 'נמסרה': 'success', 'הושלמה': 'success', 'אושר': 'success',
  'ממתינה לתשלום': 'warning', 'ממתינה לתשלום אבחון': 'warning', 'ממתינה לתשלום תיקון': 'warning',
  'ממתינה לאישור הצעת תיקון': 'warning', 'בוטלה': 'danger', 'נכשל': 'danger', 'תוקף התשלום פג': 'danger',
};
export function StatusBadge({ label, tone }: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return <span className="status-badge" data-tone={tone ?? tones[label] ?? 'neutral'}>{label}</span>;
}
