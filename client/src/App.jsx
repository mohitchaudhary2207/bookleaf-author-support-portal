import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/Common.jsx';
import { useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import BooksPage from './pages/author/BooksPage.jsx';
import NewTicketPage from './pages/author/NewTicketPage.jsx';
import MyTicketsPage from './pages/author/MyTicketsPage.jsx';
import AuthorTicketPage from './pages/author/AuthorTicketPage.jsx';
import QueuePage from './pages/admin/QueuePage.jsx';
import AdminTicketPage from './pages/admin/AdminTicketPage.jsx';
import AiPage from './pages/admin/AiPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

const homeFor = (user) => (user.role === 'admin' ? '/admin' : '/books');

/** Gate a route tree by sign-in state and (optionally) role. */
function Protected({ role, children = <Outlet /> }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner label="Loading your account…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (role && user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function Home() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Home />} />

      <Route element={<Protected><Layout /></Protected>}>
        <Route element={<Protected role="author" />}>
          <Route path="/books" element={<BooksPage />} />
          <Route path="/tickets" element={<MyTicketsPage />} />
          <Route path="/tickets/new" element={<NewTicketPage />} />
          <Route path="/tickets/:id" element={<AuthorTicketPage />} />
        </Route>
        <Route element={<Protected role="admin" />}>
          <Route path="/admin" element={<QueuePage />} />
          <Route path="/admin/tickets/:id" element={<AdminTicketPage />} />
          <Route path="/admin/ai" element={<AiPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
