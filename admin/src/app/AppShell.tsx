import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ProblemBanner } from '../components/ProblemBanner';
import { clearValidation, localizeValidation } from '../components/FormField';
import { useWebSession } from '../features/auth/useWebSession';

const adminSections = [
  { title: 'סקירה כללית', path: '/overview', icon: 'M3 3h7v8H3zM14 3h7v5h-7zM3 15h7v6H3zM14 12h7v9h-7z' },
  { title: 'קטלוג', path: '/catalog', icon: 'M3 3h18v6H3zM3 13h7v8H3zM14 13h7v8h-7z' },
  { title: 'הזמנות', path: '/orders', icon: 'M4 7h16v14H4zM4 7l2-4h12l2 4M9 10a3 3 0 0 0 6 0' },
  { title: 'בקשות שירות', path: '/service', icon: 'M14 5a5 5 0 0 0-6 6l-5 5a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-3-3 3-3Z' },
  { title: 'הגדרות', path: '/configuration', icon: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6' },
  { title: 'אנשים והרשאות', path: '/people', icon: 'M3 21a6 6 0 0 1 12 0M17 15a5 5 0 0 1 4 6M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 4a3 3 0 0 1 0 6' },
  { title: 'התראות שלא נשלחו', path: '/operations', icon: 'M4 17h16l-2-4V8a6 6 0 0 0-12 0v5zM10 21h4' },
  { title: 'יומן פעילות', path: '/operations/audit', icon: 'M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18' },
];
const technicianSections = [{ title: 'העבודות שלי', path: '/jobs', icon: 'M6 3h12v18H6zM10 17h4M9 7h6M9 11h6' }];

const descriptions: Record<string, string> = {
  '/overview': 'תמונת מצב יומית של החנות והשירות', '/catalog': 'מוצרים, קטגוריות ומלאי',
  '/orders': 'הזמנות, תשלומים ומשלוחים', '/service': 'פניות, תיאומים והתקדמות התיקון',
  '/people': 'לקוחות, טכנאים ומנהלים', '/configuration': 'דגמים, שירותים והגדרות החנות',
  '/operations': 'מעקב אחר ניסיונות שליחה', '/operations/audit': 'מי שינה מה, מתי ובאיזו רשומה',
  '/jobs': 'בקשות השירות שהוקצו לך',
};

export function AppShell() {
  const { session, client } = useWebSession();
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const sections = session?.role === 'admin' ? adminSections : technicianSections;
  const section = [...sections].reverse().find((item) => pathname.startsWith(item.path));
  const title = pathname === '/catalog/products/new' ? 'מוצר חדש' : pathname.startsWith('/catalog/products/') ? 'עריכת מוצר' : pathname === '/configuration/shop' ? 'הגדרות החנות' : section?.title ?? 'מערכת ניהול';
  useEffect(() => { document.title = `${title} · Coffix`; }, [title]);
  function closeDrawer() { drawer.current?.close(); menu.current?.focus(); }
  async function logout() {
    setBusy(true); setError(null);
    try { await client.logout(); }
    catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  const brand = <div className="brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 8h12v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M7 2v3M11 2v3" /></svg></span><span><bdi dir="ltr">Coffix</bdi><small>מערכת ניהול</small></span></div>;
  function navigation(mobile = false) {
    return <nav aria-label={mobile ? 'ניווט בנייד' : 'ניווט במערכת'}>{sections.map((item) => <NavLink key={item.path} to={item.path} end={item.path === '/operations'} onClick={mobile ? closeDrawer : undefined}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>{item.title}</NavLink>)}</nav>;
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">דילוג לתוכן</a>
    <aside className="sidebar">{brand}{navigation()}<div className="staff-identity">{session?.role === 'admin' ? 'מנהל' : 'טכנאי'}<small>מרחב עבודה לצוות</small></div></aside>
    <dialog className="navigation-drawer" ref={drawer} aria-label="תפריט ניווט" onCancel={(event) => { event.preventDefault(); closeDrawer(); }}>
      <div className="drawer-heading">{brand}<button type="button" onClick={closeDrawer} aria-label="סגירת תפריט">×</button></div>{navigation(true)}
    </dialog>
    <div className="workspace">
      <header className="topbar"><button className="menu-toggle" ref={menu} type="button" aria-label="פתיחת תפריט" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button><div><p className="workspace-title">{title}</p><small>{descriptions[section?.path ?? ''] ?? 'מרחב עבודה לצוות'}</small></div><button className="logout" onClick={() => void logout()} disabled={busy}>{busy ? 'מתנתקים…' : 'התנתקות'}</button></header>
      <main id="main-content" tabIndex={-1} onInvalidCapture={localizeValidation} onInputCapture={clearValidation}><ProblemBanner error={error} /><Outlet /></main>
    </div>
  </div>;
}
