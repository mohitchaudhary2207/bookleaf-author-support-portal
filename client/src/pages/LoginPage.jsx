import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Field } from '../components/Common.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Demo accounts for evaluators (seeded dataset). Hidden in a real deployment with VITE_SHOW_DEMO=false.
const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO !== 'false';
const DEMO_AUTHORS = [
  ['Priya Sharma', 'priya.sharma@email.com', '2 books · pending royalty'],
  ['Rohit Kapoor', 'rohit.kapoor@email.com', '2 books · top seller'],
  ['Ananya Reddy', 'ananya.reddy@email.com', 'never paid yet'],
  ['Vikram Joshi', 'vikram.joshi@email.com', 'poetry + self-help'],
  ['Meera Nair', 'meera.nair@email.com', '2 books'],
  ['Arjun Malhotra', 'arjun.malhotra@email.com', 'never paid yet'],
  ['Sneha Kulkarni', 'sneha.kulkarni@email.com', '1 book in production'],
  ['Farhan Sheikh', 'farhan.sheikh@email.com', 'fully paid'],
  ['Kavita Deshmukh', 'kavita.deshmukh@email.com', 'in production + below payout threshold'],
  ['Diya Chatterjee', 'diya.chatterjee@email.com', '2 books'],
];
const DEMO_ADMINS = [['Riya Mehta (Support Lead)', 'admin@bookleaf.com'], ['Aman Verma (Support)', 'support@bookleaf.com']];

export default function LoginPage() {
  const { user, login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErrors({}); setFormError(''); setBusy(true);
    try {
      await login(form.email, form.password);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      if (err.status === 422) setErrors(err.fieldErrors);
      else setFormError(err.message);
    } finally { setBusy(false); }
  };

  const fill = (email, password) => setForm({ email, password });

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand"><span className="logo" aria-hidden>🍃</span><h1>BookLeaf</h1><p className="muted">Author Support &amp; Communication Portal</p></div>

        {sessionExpired && <div className="alert alert-warn" role="alert">Your session ended. Please sign in again.</div>}
        {formError && <div className="alert alert-error" role="alert">{formError}</div>}

        <form onSubmit={submit} noValidate>
          <Field label="Email" htmlFor="email" error={errors.email}>
            <input id="email" type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" autoFocus />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password}>
            <input id="password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>

        {SHOW_DEMO && (
          <details className="demo">
            <summary>Demo accounts (click to fill)</summary>
            <p className="muted small">All author passwords: <code>Author@123</code> · admin password: <code>Admin@123</code></p>
            <h4>Support team</h4>
            <div className="demo-list">
              {DEMO_ADMINS.map(([name, email]) => (
                <button type="button" key={email} className="demo-item" onClick={() => fill(email, 'Admin@123')}><strong>{name}</strong><span>{email}</span></button>
              ))}
            </div>
            <h4>Authors</h4>
            <div className="demo-list">
              {DEMO_AUTHORS.map(([name, email, note]) => (
                <button type="button" key={email} className="demo-item" onClick={() => fill(email, 'Author@123')}><strong>{name}</strong><span>{note}</span></button>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
