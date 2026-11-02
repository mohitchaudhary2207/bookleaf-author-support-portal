import { lazy, Suspense, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Field } from '../components/Common.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Demo quick-fill is OPT-IN. In a production build it is on only when built with VITE_SHOW_DEMO=true (isolated
// evaluation deployment). The vite dev server shows it unless VITE_SHOW_DEMO=false. The comparison is written inline
// so the bundler can fold it to a constant and drop the lazily imported panel (and its demo passwords) when it is off.
const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO === 'true' || (import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO !== 'false');
const DemoAccounts = SHOW_DEMO ? lazy(() => import('../components/DemoAccounts.jsx')) : null;

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

        {DemoAccounts && <Suspense fallback={null}><DemoAccounts onPick={fill} /></Suspense>}
      </div>
    </div>
  );
}
