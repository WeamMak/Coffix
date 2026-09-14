import { Navigate, Outlet } from 'react-router-dom';
import { useWebSession } from '../features/auth/useWebSession';

export function AuthGuard() {
  const { ready, session } = useWebSession();
  if (!ready) return <div className="login-page"><p role="status" className="empty-state">משחזרים את החיבור…</p></div>;
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}
