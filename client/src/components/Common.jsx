import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, TriangleAlert } from 'lucide-react';

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="spinner-wrap" role="status"><span className="spinner" /><span>{label}</span></div>
);

/** Shimmer placeholders; the real layout appears in the same place once data arrives. */
export const Skeleton = ({ className = 'skel-line', style }) => <span className={`skeleton ${className}`} style={style} aria-hidden />;

export const PageSkeleton = ({ label = 'Loading…' }) => (
  <div className="page" role="status" aria-label={label}>
    <Skeleton className="skel-title" />
    <div className="stats">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="skel-block" />)}</div>
    <Skeleton className="skel-block" style={{ height: 220 }} />
  </div>
);

export const EmptyState = ({ icon: Icon, title, children, action }) => (
  <div className="empty">
    {Icon && <div className="empty-icon" aria-hidden><Icon size={26} strokeWidth={1.75} /></div>}
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action && (action.to
      ? <Link className="btn btn-primary" to={action.to}>{action.label}</Link>
      : <button className="btn btn-primary" onClick={action.onClick}>{action.label}</button>)}
  </div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div className="empty empty-error" role="alert">
    <div className="empty-icon" aria-hidden><TriangleAlert size={26} strokeWidth={1.75} /></div>
    <h3>Something went wrong</h3>
    <p>{error?.message ?? 'Unexpected error'}</p>
    {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
  </div>
);

export const PageHeader = ({ title, subtitle, children, eyebrow }) => (
  <div className="page-header">
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
    </div>
    {children && <div className="page-actions">{children}</div>}
  </div>
);

export const Field = ({ label, error, hint, children, htmlFor }) => (
  <div className={`field ${error ? 'has-error' : ''}`}>
    <label htmlFor={htmlFor}>{label}</label>
    {children}
    {error
      ? <p className="field-error" role="alert"><AlertCircle size={14} />{error}</p>
      : hint && <p className="field-hint">{hint}</p>}
  </div>
);

export const Card = ({ title, icon: Icon, actions, children, className = '' }) => (
  <section className={`card ${className}`}>
    {(title || actions) && (
      <header className="card-head"><h2>{Icon && <Icon size={18} strokeWidth={1.9} aria-hidden />}{title}</h2><div className="row">{actions}</div></header>
    )}
    {children}
  </section>
);

/** A single headline metric. Pass onClick to make it a filter shortcut. */
export const Stat = ({ label, value, hint, icon: Icon, tone = '', onClick, title }) => {
  const body = (
    <>
      <span className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon && <span className="stat-icon" aria-hidden><Icon size={16} strokeWidth={2} /></span>}
      </span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  const cls = `stat ${tone ? `stat-${tone}` : ''}`;
  return onClick
    ? <button type="button" className={cls} onClick={onClick} title={title}>{body}</button>
    : <div className={cls} title={title}>{body}</div>;
};

const ALERT_ICON = { error: AlertCircle, warn: AlertTriangle, info: Info, ok: CheckCircle2 };
export const Alert = ({ kind = 'info', children, role }) => {
  const Icon = ALERT_ICON[kind];
  return <div className={`alert alert-${kind}`} role={role ?? (kind === 'error' ? 'alert' : undefined)}><Icon size={18} aria-hidden /><div className="alert-body">{children}</div></div>;
};

export const Pagination = ({ page, totalPages, total, noun = 'ticket', onPage }) => (
  <div className="pagination">
    <span className="muted small">{total} {noun}{total === 1 ? '' : 's'}</span>
    <div className="pagination-nav">
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} />Prev</button>
      <span className="pagination-pos">Page {page} of {totalPages}</span>
      <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next<ChevronRight size={16} /></button>
    </div>
  </div>
);

/**
 * Confirmation dialog built on the native <dialog> element (focus trapping, Esc to close and the
 * backdrop come from the platform). Replaces window.confirm for a consistent, branded experience.
 */
export function ConfirmModal({ open, title, children, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onCancel={(e) => { e.preventDefault(); onCancel(); }} onClick={(e) => { if (e.target === ref.current) onCancel(); }} aria-labelledby="modal-title">
      <div className="modal-body">
        <h2 id="modal-title">{title}</h2>
        <div>{children}</div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} autoFocus>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
