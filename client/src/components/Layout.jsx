import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLive } from '../context/LiveContext.jsx';

const LIVE_LABEL = { live: 'Live', reconnecting: 'Reconnecting…', offline: 'Offline' };

function LiveIndicator() {
  const { status } = useLive();
  return (
    <span className={`live live-${status}`} title="Real-time connection: updates appear without refreshing">
      <span className="dot" />{LIVE_LABEL[status]}
    </span>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user.role === 'admin';

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            <span className="logo" aria-hidden>🍃</span>
            <span>BookLeaf <small>{isAdmin ? 'Support Console' : 'Author Portal'}</small></span>
          </NavLink>

          <nav className="nav" aria-label="Main">
            {isAdmin ? (
              <>
                <NavLink to="/admin" end>Ticket queue</NavLink>
                <NavLink to="/admin/ai">AI &amp; usage</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/books">My Books</NavLink>
                <NavLink to="/tickets/new">Get Support</NavLink>
                <NavLink to="/tickets" end>My Tickets</NavLink>
              </>
            )}
          </nav>

          <div className="topbar-right">
            <LiveIndicator />
            <div className="who">
              <strong>{user.name.replace(/\s*\(.*\)$/, '')}</strong>
              <span className="muted">{isAdmin ? 'Admin' : 'Author'}</span>
            </div>
            <button className="btn btn-ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="main"><Outlet /></main>
      <footer className="footer">BookLeaf Publishing · Author support · AI-assisted, human-reviewed</footer>
    </div>
  );
}
