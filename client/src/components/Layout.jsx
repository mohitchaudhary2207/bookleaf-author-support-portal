import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, LayoutDashboard, LifeBuoy, ListChecks, LogOut, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLive } from '../context/LiveContext.jsx';
import { BrandLogo, BrandMark } from './Brand.jsx';

const LIVE_LABEL = { live: 'Live', reconnecting: 'Reconnecting…', offline: 'Offline' };
const COLLAPSE_KEY = 'bookleaf.sidebar.collapsed';

const AUTHOR_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/dashboard' },
  { to: '/books', label: 'My Books', icon: BookOpen, match: (p) => p === '/books' },
  { to: '/tickets', label: 'My Tickets', icon: MessageSquare, match: (p) => p === '/tickets' || (/^\/tickets\/\d+/.test(p)) },
  { to: '/tickets/new', label: 'Get Support', icon: LifeBuoy, match: (p) => p === '/tickets/new' },
];
const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/admin/dashboard' },
  { to: '/admin', label: 'Ticket Queue', icon: ListChecks, match: (p) => p === '/admin' || p.startsWith('/admin/tickets') },
  { to: '/admin/ai', label: 'AI Usage', icon: Sparkles, match: (p) => p === '/admin/ai' },
];

function LiveIndicator() {
  const { status } = useLive();
  return (
    <span className={`live live-${status}`} title="Real-time connection: updates appear without refreshing">
      <span className="dot" />{LIVE_LABEL[status]}
    </span>
  );
}

const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };
const initials = (name = '') => name.replace(/\s*\(.*\)$/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const isAdmin = user.role === 'admin';
  const nav = isAdmin ? ADMIN_NAV : AUTHOR_NAV;
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const cleanName = user.name.replace(/\s*\(.*\)$/, '');

  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const toggleCollapsed = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* storage unavailable: preference just is not remembered */ }
    return !c;
  });

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} aria-hidden />}

      <aside className={`sidebar ${drawer ? 'is-open' : ''}`} aria-label="Sidebar">
        <div className="sb-head">
          <Link to={isAdmin ? '/admin/dashboard' : '/dashboard'} className="sb-brand" aria-label="BookLeaf Publishing - home">
            <span className="sb-logo-full"><BrandLogo width={150} /></span>
            <span className="sb-logo-mark"><BrandMark size={40} /></span>
          </Link>
          <button className="btn btn-ghost btn-icon sb-close" onClick={() => setDrawer(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <p className="sb-role">{isAdmin ? 'Support Console' : 'Author Portal'}</p>

        <nav className="sb-nav" aria-label="Main">
          {nav.map(({ to, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link key={to} to={to} className={`sb-link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined} data-tip={collapsed ? label : undefined}>
                <Icon size={19} strokeWidth={1.9} aria-hidden /><span className="sb-label">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sb-foot">
          <div className="sb-user">
            <span className="avatar" aria-hidden>{initials(user.name)}</span>
            <span className="sb-user-text"><strong>{cleanName}</strong><span className="muted xs">{isAdmin ? 'Admin' : 'Author'}</span></span>
          </div>
          <button className="sb-link sb-signout" onClick={logout} data-tip={collapsed ? 'Sign out' : undefined}>
            <LogOut size={19} strokeWidth={1.9} aria-hidden /><span className="sb-label">Sign out</span>
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="appbar">
          <button className="btn btn-ghost btn-icon appbar-menu" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={20} /></button>
          <button className="btn btn-ghost btn-icon appbar-collapse" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed}>
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <span className="appbar-brand"><BrandLogo width={96} /></span>
          <span className="spacer" />
          <LiveIndicator />
        </header>
        <main id="main" className="main" tabIndex={-1}><Outlet /></main>
        <footer className="footer">BookLeaf Publishing · Author support · AI-assisted, human-reviewed</footer>
      </div>
    </div>
  );
}
