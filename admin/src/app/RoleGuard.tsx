import { Link, Outlet } from 'react-router-dom';
import type { StaffRole } from '../features/auth/api';
import { useWebSession } from '../features/auth/useWebSession';

export function RoleGuard({ role }: { role: StaffRole }) {
  const { session } = useWebSession();
  if (session?.role === role) return <Outlet />;
  return <section><h1>Access denied</h1><p>Your role does not have access to this page.</p><Link to="/">Return to your workspace</Link></section>;
}
