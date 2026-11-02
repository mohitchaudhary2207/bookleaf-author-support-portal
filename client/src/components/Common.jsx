import { Link } from 'react-router-dom';

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="spinner-wrap" role="status"><span className="spinner" /><span>{label}</span></div>
);

export const EmptyState = ({ icon = '📭', title, children, action }) => (
  <div className="empty">
    <div className="empty-icon" aria-hidden>{icon}</div>
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action && (action.to
      ? <Link className="btn btn-primary" to={action.to}>{action.label}</Link>
      : <button className="btn btn-primary" onClick={action.onClick}>{action.label}</button>)}
  </div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div className="empty empty-error" role="alert">
    <div className="empty-icon" aria-hidden>⚠️</div>
    <h3>Something went wrong</h3>
    <p>{error?.message ?? 'Unexpected error'}</p>
    {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
  </div>
);

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="page-header">
    <div>
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
    </div>
    <div className="page-actions">{children}</div>
  </div>
);

export const Field = ({ label, error, hint, children, htmlFor }) => (
  <div className={`field ${error ? 'has-error' : ''}`}>
    <label htmlFor={htmlFor}>{label}</label>
    {children}
    {error ? <p className="field-error" role="alert">{error}</p> : hint && <p className="field-hint">{hint}</p>}
  </div>
);

export const Card = ({ title, actions, children, className = '' }) => (
  <section className={`card ${className}`}>
    {(title || actions) && (
      <header className="card-head"><h2>{title}</h2><div>{actions}</div></header>
    )}
    {children}
  </section>
);
