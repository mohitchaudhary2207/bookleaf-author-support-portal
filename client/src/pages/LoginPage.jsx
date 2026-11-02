import { lazy, Suspense, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Eye, EyeOff, LifeBuoy, Wallet } from 'lucide-react';
import { BrandLogo } from '../components/Brand.jsx';
import { Alert, Field } from '../components/Common.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Demo quick-fill is OPT-IN. In a production build it is on only when built with VITE_SHOW_DEMO=true (isolated
// evaluation deployment). The vite dev server shows it unless VITE_SHOW_DEMO=false. The comparison is written inline
// so the bundler can fold it to a constant and drop the lazily imported panel (and its demo passwords) when it is off.
const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO === 'true' || (import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO !== 'false');
const DemoAccounts = SHOW_DEMO ? lazy(() => import('../components/DemoAccounts.jsx')) : null;

const HIGHLIGHTS = [
  [BookOpen, 'Every book, start to finish', 'Follow each title from manuscript to bookshelf, with its ISBN, status and platforms.'],
  [Wallet, 'Royalties you can read', 'See what you have earned, what has been paid and what is still pending.'],
  [LifeBuoy, 'Support that answers', 'Raise a query and follow the reply here, live, without refreshing.'],
];

export default function LoginPage() {
  const { user, login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const local = {};
    if (!form.email.trim()) local.email = 'Enter your email address.';
    if (!form.password) local.password = 'Enter your password.';
    setErrors(local); setFormError('');
    if (Object.keys(local).length) return;
    setBusy(true);
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
    <div className="login">
      <section className="login-panel">
        <div className="login-box">
          <BrandLogo width={180} className="login-logo" />
          <h1 className="login-title">Welcome back</h1>
          <p className="muted login-sub">Sign in to the Author Support &amp; Communication Portal.</p>

          {sessionExpired && <Alert kind="warn" role="alert">Your session ended. Please sign in again.</Alert>}
          {formError && <Alert kind="error">{formError}</Alert>}

          <form onSubmit={submit} noValidate>
            <Field label="Email" htmlFor="email" error={errors.email}>
              <input id="email" type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" autoFocus />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password}>
              <div className="input-wrap has-action">
                <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" className="btn btn-ghost btn-sm btn-icon input-action" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <><span className="spinner sm" />Signing in…</> : 'Sign in'}</button>
          </form>

          {DemoAccounts && <Suspense fallback={null}><DemoAccounts onPick={fill} /></Suspense>}
        </div>
      </section>

      <aside className="login-aside" aria-hidden={false}>
        <div className="login-aside-inner">
          <p className="eyebrow">BookLeaf Publishing</p>
          <h2 className="login-hero">Your books. Your royalties. One place.</h2>
          <ul className="login-points">
            {HIGHLIGHTS.map(([Icon, title, text]) => (
              <li key={title}>
                <span className="login-point-icon"><Icon size={20} strokeWidth={1.9} /></span>
                <span><strong>{title}</strong><span>{text}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
