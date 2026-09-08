import { Navigate, Outlet } from 'react-router-dom';
import { useWebSession } from '../features/auth/useWebSession';

export function AuthGuard() {
  const { ready, session } = useWebSession();
  if (!ready) return <p role="status">Restoring session…</p>;
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}
