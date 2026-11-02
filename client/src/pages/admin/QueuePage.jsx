import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertOctagon, CheckCircle2, ChevronDown, ChevronUp, ChevronsUpDown, Clock, Flame, Inbox, ListChecks, Search, SearchX, UserX, Gauge, ShieldAlert } from 'lucide-react';
import { api } from '../../api/client.js';
import { useDebouncedCallback, useFetch } from '../../api/hooks.js';
import { useMeta } from '../../api/meta.js';
import { CategoryBadge, PriorityBadge, SourceTag, StatusBadge } from '../../components/Badges.jsx';
import { EmptyState, ErrorState, PageHeader, Pagination, Skeleton, Stat } from '../../components/Common.jsx';
import { useLiveEvents } from '../../context/LiveContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate, slaState, timeAgo } from '../../utils/format.js';

const STATUS_OPTIONS = [
  ['Open,In Progress', 'Active (Open + In Progress)'], ['Open', 'Open'], ['In Progress', 'In Progress'],
  ['Resolved', 'Resolved'], ['Closed', 'Closed'], ['all', 'All statuses'],
];
const ACTIVE_VALUE = 'Open,In Progress';

const SLA_ICON = { overdue: AlertOctagon, soon: Clock, ok: Clock, done: CheckCircle2 };
const clean = (name = '') => name.replace(/\s*\(.*\)$/, '');

/** A sortable column header. `asc`/`desc` are the sort keys the API understands for this column. */
function SortTh({ label, current, asc, desc, onSort }) {
  const active = current === asc || current === desc;
  const Icon = !active ? ChevronsUpDown : current === desc ? ChevronDown : ChevronUp;
  return (
    <th aria-sort={!active ? 'none' : current === asc ? 'ascending' : 'descending'}>
      <button type="button" className={`th-sort ${active ? 'is-active' : ''}`} onClick={() => onSort(current === desc ? asc : desc)}>{label}<Icon size={14} /></button>
    </th>
  );
}

export default function QueuePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const meta = useMeta();

  const filters = {
    status: params.get('status') ?? ACTIVE_VALUE,
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
  const dirty = ['category', 'priority', 'assignee', 'q', 'from', 'to', 'status', 'sort'].some((k) => params.get(k));

  // Real time: refresh the queue + stats when tickets change; announce brand-new ones.
  const refreshAll = useDebouncedCallback(() => { tickets.refresh(); stats.refresh(); }, 300);
  useLiveEvents((evt) => {
    if (evt.type === 'ticket.created') toast.info('New support ticket received.', { action: { label: 'View', onClick: () => navigate(`/admin/tickets/${evt.ticketId}`) } });
    if (evt.type !== 'ticket.note') refreshAll();
  });

  const s = stats.data;
  const tiles = useMemo(() => (s ? [
    { label: 'Active tickets', value: s.totalOpen, icon: Inbox },
    { label: 'Overdue (no reply in SLA)', value: s.overdue, tone: s.overdue ? 'danger' : '', icon: AlertOctagon },
    { label: 'Unassigned', value: s.unassignedOpen, tone: s.unassignedOpen ? 'warn' : '', icon: UserX, onClick: () => setFilter('assignee', 'unassigned') },
    { label: 'Critical open', value: s.openByPriority.Critical ?? 0, tone: s.openByPriority.Critical ? 'danger' : '', icon: Flame, onClick: () => setFilter('priority', 'Critical') },
    { label: 'Need triage review', value: s.needsTriageReview, hint: 'Triaged by fallback rules', tone: s.needsTriageReview ? 'warn' : '', icon: ShieldAlert },
    { label: 'Avg first response', value: s.avgFirstResponseHours == null ? '—' : `${s.avgFirstResponseHours}h`, icon: Gauge },
  ] : []), [s]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = tickets.data;
  const now = Date.now();

  return (
    <div className="page wide">
      <PageHeader eyebrow="Support console" title="Ticket queue" subtitle="Most urgent and oldest unresolved tickets appear first." />

      <div className="stats stats-compact">
        {stats.loading && !s
          ? [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="skel-block" style={{ height: 82 }} />)
          : tiles.map((t) => <Stat key={t.label} label={t.label} value={t.value} hint={t.hint} tone={t.tone} icon={t.icon} onClick={t.onClick} />)}
      </div>

      <section className="card filters" aria-label="Filters">
        <div className="input-wrap search">
          <Search size={17} aria-hidden />
          <input type="search" placeholder="Search subject, author, book or BL-00012…" aria-label="Search tickets" defaultValue={filters.q} key={`q-${filters.q}`}
            onKeyDown={(e) => { if (e.key === 'Enter') setFilter('q', e.currentTarget.value.trim()); }} onBlur={(e) => { if (e.target.value.trim() !== filters.q) setFilter('q', e.target.value.trim()); }} />
        </div>
        <select className="compact" value={filters.status} onChange={(e) => setFilter('status', e.target.value === ACTIVE_VALUE ? '' : e.target.value)} aria-label="Status">
          {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="compact" value={filters.category} onChange={(e) => setFilter('category', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {meta?.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="compact" value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} aria-label="Priority">
          <option value="">All priorities</option>
          {meta?.priorities.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="compact" value={filters.assignee} onChange={(e) => setFilter('assignee', e.target.value)} aria-label="Assignee">
          <option value="">Anyone</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option>
        </select>
        <label className="date-filter">From <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} /></label>
        <label className="date-filter">To <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} /></label>
        <select className="compact" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value === 'urgency' ? '' : e.target.value)} aria-label="Sort">
          <option value="urgency">Sort: Urgency</option><option value="oldest">Sort: Oldest first</option>
          <option value="newest">Sort: Newest first</option><option value="updated">Sort: Recently updated</option>
        </select>
        {dirty && <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Reset</button>}
      </section>

      {tickets.loading && !data ? (
        <div className="card flush">{[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ padding: 16 }}><Skeleton className="skel-line" /><Skeleton className="skel-line" style={{ width: '60%' }} /></div>)}</div>
      ) : tickets.error ? <ErrorState error={tickets.error} onRetry={tickets.reload} /> : (
        data.items.length === 0 ? (
          <EmptyState icon={dirty ? SearchX : ListChecks} title={dirty ? 'No tickets match these filters' : 'Inbox zero'} action={dirty ? { label: 'Reset filters', onClick: clearFilters } : undefined}>
            {dirty ? 'Try widening the filters.' : 'There are no tickets here right now.'}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="queue">
                <thead>
                  <tr>
                    <SortTh label="Priority" current={filters.sort} asc="urgency" desc="urgency" onSort={() => setFilter('sort', '')} />
                    <th>Ticket</th><th>Author &amp; book</th><th>Category</th><th>Status &amp; assignee</th>
                    <SortTh label="Created" current={filters.sort} asc="oldest" desc="newest" onSort={(v) => setFilter('sort', v)} />
                    <SortTh label="Updated" current={filters.sort} asc="updated" desc="updated" onSort={(v) => setFilter('sort', v)} />
                    <th>SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => {
                    const sla = slaState(t.sla, t.firstResponseAt, t.status, now);
                    const SlaIcon = SLA_ICON[sla.tone];
                    const authorWaiting = t.lastSenderRole === 'author' && ['Open', 'In Progress'].includes(t.status);
                    const prio = (t.priority ?? 'none').toLowerCase();
                    return (
                      <tr key={t.id} className={`row-prio-${prio} ${t.sla.overdue ? 'row-overdue' : ''} ${['Resolved', 'Closed'].includes(t.status) ? 'row-done' : ''}`}
                        onClick={() => navigate(`/admin/tickets/${t.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/tickets/${t.id}`)}>
                        <td data-label="Priority"><PriorityBadge priority={t.priority} /> <SourceTag source={t.prioritySource} /></td>
                        <td data-label="Ticket" className="cell-main">
                          <Link to={`/admin/tickets/${t.id}`} onClick={(e) => e.stopPropagation()}><strong>{t.subject}</strong></Link>
                          <div className="muted xs"><span className="mono">{t.ticketNumber}</span>{authorWaiting && <span className="badge badge-new plain waiting">Author replied</span>}</div>
                        </td>
                        <td data-label="Author &amp; book"><div className="stack"><span>{t.author.name}</span><span className="muted xs">{t.book ? t.book.title : 'General / Account'}</span></div></td>
                        <td data-label="Category"><CategoryBadge category={t.category} /> <SourceTag source={t.categorySource} /></td>
                        <td data-label="Status &amp; assignee"><StatusBadge status={t.status} /><div className="muted xs">{t.assignedTo ? clean(t.assignedTo.name) : 'Unassigned'}</div></td>
                        <td data-label="Created" className="nowrap" title={formatDate(t.createdAt, { time: true })}>{formatDate(t.createdAt)}<div className="muted xs">{timeAgo(t.createdAt)}</div></td>
                        <td data-label="Updated" className="nowrap muted" title={formatDate(t.updatedAt, { time: true })}>{timeAgo(t.updatedAt)}</td>
                        <td data-label="SLA" title={`First reply target: ${t.sla.targetHours}h`}><span className={`sla-pill sla-${sla.tone}`}><SlaIcon size={14} />{sla.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={(p) => setFilter('page', p)} />
          </>
        )
      )}
    </div>
  );
}
