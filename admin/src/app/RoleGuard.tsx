import { Link, Outlet } from 'react-router-dom';
import type { StaffRole } from '../features/auth/api';
import { useWebSession } from '../features/auth/useWebSession';

export function RoleGuard({ role }: { role: StaffRole }) {
  const { session } = useWebSession();
  if (session?.role === role) return <Outlet />;
  return <section className="editor-panel"><h1>אין הרשאה</h1><p>אין לכם הרשאה לצפות בעמוד הזה.</p><Link to="/">חזרה למרחב העבודה</Link></section>;
}
