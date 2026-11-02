import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useDebouncedCallback, useFetch } from '../../api/hooks.js';
import { useMeta } from '../../api/meta.js';
import { CategoryBadge, PriorityBadge, SourceTag, StatusBadge } from '../../components/Badges.jsx';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/Common.jsx';
import { useLiveEvents } from '../../context/LiveContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { ageLabel, timeAgo } from '../../utils/format.js';

const DEFAULT_STATUS = 'Open,In Progress';
const STATUS_OPTIONS = [
  ['Open,In Progress', 'Active (Open + In Progress)'], ['Open', 'Open'], ['In Progress', 'In Progress'],
  ['Resolved', 'Resolved'], ['Closed', 'Closed'], ['all', 'All statuses'],
];

export default function QueuePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const meta = useMeta();

  const filters = {
    status: params.get('status') ?? DEFAULT_STATUS,
    category: params.get('category') ?? '',
    priority: params.get('priority') ?? '',
    assignee: params.get('assignee') ?? '',
    q: params.get('q') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    sort: params.get('sort') ?? 'urgency',
    page: Number(params.get('page') ?? 1),
  };

  const query = { ...filters, status: filters.status === 'all' ? '' : filters.status, pageSize: 25 };
  const tickets = useFetch(() => api.get('/admin/tickets', query), [params.toString()]);
  const stats = useFetch(() => api.get('/admin/stats'), []);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === '' || value == null) next.delete(key); else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const clearFilters = () => setParams({}, { replace: true });
  const dirty = ['category', 'priority', 'assignee', 'q', 'from', 'to'].some((k) => params.get(k)) || params.get('status') || params.get('sort');

  // Real time: refresh the queue + stats when tickets change; announce brand-new ones.
  const refreshAll = useDebouncedCallback(() => { tickets.refresh(); stats.refresh(); }, 300);
  useLiveEvents((evt) => {
    if (evt.type === 'ticket.created') toast.info('New support ticket received.', { action: { label: 'View', onClick: () => navigate(`/admin/tickets/${evt.ticketId}`) } });
    if (evt.type !== 'ticket.note') refreshAll();
  });

  const s = stats.data;
  const tiles = useMemo(() => (s ? [
    { label: 'Active tickets', value: s.totalOpen },
    { label: 'Overdue (no reply in SLA)', value: s.overdue, tone: s.overdue ? 'danger' : '' },
    { label: 'Unassigned', value: s.unassignedOpen, tone: s.unassignedOpen ? 'warn' : '', onClick: () => setFilter('assignee', 'unassigned') },
    { label: 'Critical open', value: s.openByPriority.Critical ?? 0, tone: s.openByPriority.Critical ? 'danger' : '', onClick: () => setFilter('priority', 'Critical') },
    { label: 'Need triage review', value: s.needsTriageReview, hint: 'Triaged by fallback rules', tone: s.needsTriageReview ? 'warn' : '' },
    { label: 'Avg first response', value: s.avgFirstResponseHours == null ? '—' : `${s.avgFirstResponseHours}h` },
  ] : []), [s]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = tickets.data;

  return (
    <div className="page wide">
      <PageHeader title="Ticket queue" subtitle="Most urgent and oldest unresolved tickets appear first." />

      <div className="tiles">
        {tiles.map((t) => (
          <button key={t.label} type="button" className={`tile tile-btn ${t.tone ? `tile-${t.tone}` : ''}`} onClick={t.onClick} disabled={!t.onClick} title={t.hint}>
            <span className="label">{t.label}</span><strong>{t.value}</strong>
          </button>
        ))}
      </div>

      <section className="card filters" aria-label="Filters">
        <input className="search" type="search" placeholder="Search subject, author, book or BL-00012…" defaultValue={filters.q} key={`q-${filters.q}`}
          onKeyDown={(e) => { if (e.key === 'Enter') setFilter('q', e.currentTarget.value.trim()); }} onBlur={(e) => { if (e.target.value.trim() !== filters.q) setFilter('q', e.target.value.trim()); }} />
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value === DEFAULT_STATUS ? '' : e.target.value)} aria-label="Status">
          {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.category} onChange={(e) => setFilter('category', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {meta?.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} aria-label="Priority">
          <option value="">All priorities</option>
          {meta?.priorities.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={filters.assignee} onChange={(e) => setFilter('assignee', e.target.value)} aria-label="Assignee">
          <option value="">Anyone</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option>
        </select>
        <label className="date-filter">From <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} /></label>
        <label className="date-filter">To <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} /></label>
        <select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value === 'urgency' ? '' : e.target.value)} aria-label="Sort">
          <option value="urgency">Sort: Urgency</option><option value="oldest">Sort: Oldest first</option>
          <option value="newest">Sort: Newest first</option><option value="updated">Sort: Recently updated</option>
        </select>
        {dirty && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Reset</button>}
      </section>

      {tickets.loading && !data ? <Spinner label="Loading tickets…" /> : tickets.error ? <ErrorState error={tickets.error} onRetry={tickets.reload} /> : (
        data.items.length === 0 ? (
          <EmptyState icon="🎉" title={dirty ? 'No tickets match these filters' : 'Inbox zero'} action={dirty ? { label: 'Reset filters', onClick: clearFilters } : undefined}>
            {dirty ? 'Try widening the filters.' : 'There are no tickets here right now.'}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="queue">
                <thead>
                  <tr><th>Priority</th><th>Ticket</th><th>Category</th><th>Status</th><th>Assignee</th><th>Age</th><th>Activity</th></tr>
                </thead>
                <tbody>
                  {data.items.map((t) => {
                    const overdue = t.sla.overdue;
                    const authorWaiting = t.lastSenderRole === 'author' && ['Open', 'In Progress'].includes(t.status);
                    return (
                      <tr key={t.id} className={`${overdue ? 'row-overdue' : ''} ${['Resolved', 'Closed'].includes(t.status) ? 'row-done' : ''}`}
                        onClick={() => navigate(`/admin/tickets/${t.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/tickets/${t.id}`)}>
                        <td><PriorityBadge priority={t.priority} /> <SourceTag source={t.prioritySource} /></td>
                        <td className="cell-main">
                          <Link to={`/admin/tickets/${t.id}`} onClick={(e) => e.stopPropagation()}><strong>{t.subject}</strong></Link>
                          <div className="muted small"><span className="mono">{t.ticketNumber}</span> · {t.author.name}{t.book ? ` · ${t.book.title}` : ' · General'}</div>
                        </td>
                        <td><CategoryBadge category={t.category} /> <SourceTag source={t.categorySource} /></td>
                        <td><StatusBadge status={t.status} /></td>
                        <td>{t.assignedTo ? t.assignedTo.name.replace(/\s*\(.*\)$/, '') : <span className="muted">Unassigned</span>}</td>
                        <td className={overdue ? 'age age-overdue' : 'age'} title={overdue ? `Past the ${t.sla.targetHours}h first-response target` : `Target: first reply within ${t.sla.targetHours}h`}>
                          {ageLabel(t.ageHours)}{overdue && <span className="overdue-flag">Overdue</span>}
                        </td>
                        <td className="small">
                          {authorWaiting ? <span className="badge badge-new">Author replied</span> : <span className="muted">{timeAgo(t.updatedAt)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="muted">{data.total} ticket{data.total === 1 ? '' : 's'}</span>
              <div>
                <button className="btn btn-sm" disabled={filters.page <= 1} onClick={() => setFilter('page', filters.page - 1)}>← Prev</button>
                <span className="pager-pos">Page {data.page} of {data.totalPages}</span>
                <button className="btn btn-sm" disabled={filters.page >= data.totalPages} onClick={() => setFilter('page', filters.page + 1)}>Next →</button>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
