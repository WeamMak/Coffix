import { Navigate, Route, Routes } from 'react-router-dom';
import { adminSections, AppShell } from './app/AppShell';
import { AuthGuard } from './app/AuthGuard';
import { RoleGuard } from './app/RoleGuard';
import { OtpLogin } from './features/auth/OtpLogin';
import { useWebSession } from './features/auth/useWebSession';

function Home() {
  const { session } = useWebSession();
  return <Navigate to={session?.role === 'admin' ? '/overview' : '/jobs'} replace />;
}

function WorkspacePage({ title }: { title: string }) {
  return <section className="workspace-page"><p className="eyebrow">Coffix workspace</p><h1>{title}</h1><div className="empty-state"><h2>Your workspace is ready</h2><p>Tools for this area will be available in an upcoming update.</p></div></section>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<OtpLogin />} />
      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route element={<RoleGuard role="admin" />}>
            {adminSections.map((title) => <Route key={title} path={`/${title.toLowerCase()}`} element={<WorkspacePage title={title} />} />)}
          </Route>
          <Route element={<RoleGuard role="technician" />}>
            <Route path="/jobs" element={<WorkspacePage title="My jobs" />} />
          </Route>
          <Route path="*" element={<section><h1>Page not found</h1><p>Choose a page from your workspace navigation.</p></section>} />
        </Route>
      </Route>
    </Routes>
  );
}
