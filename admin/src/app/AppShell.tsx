import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ProblemBanner } from '../components/ProblemBanner';
import { useWebSession } from '../features/auth/useWebSession';

export const adminSections = ['Overview', 'Catalog', 'Orders', 'Service', 'Configuration', 'People', 'Operations'];

export function AppShell() {
  const { session, client } = useWebSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sections = session?.role === 'admin' ? adminSections : ['My jobs'];
  async function logout() {
    setBusy(true); setError(null);
    try { await client.logout(); }
    catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <p className="brand">coffix<span> / staff</span></p>
        <nav aria-label="Workspace">
          {sections.map((label) => <NavLink key={label} to={label === 'My jobs' ? '/jobs' : `/${label.toLowerCase()}`}>{label}</NavLink>)}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar"><span>{session?.role === 'admin' ? 'Administrator workspace' : 'Technician workspace'}</span><button onClick={() => void logout()} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button></header>
        <main id="main-content" tabIndex={-1}><ProblemBanner error={error} /><Outlet /></main>
      </div>
    </div>
  );
}
