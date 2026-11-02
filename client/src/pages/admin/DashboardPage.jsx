import { Link, useNavigate } from 'react-router-dom';
import { AlertOctagon, ArrowRight, CheckCircle2, CircleDot, Flame, Gauge, Inbox, Loader, PlusCircle, TrendingUp } from 'lucide-react';
import { api } from '../../api/client.js';
import { useDebouncedCallback, useFetch } from '../../api/hooks.js';
import { PriorityBadge, StatusBadge } from '../../components/Badges.jsx';
import { Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Stat } from '../../components/Common.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLiveEvents } from '../../context/LiveContext.jsx';
import { firstName, timeAgo } from '../../utils/format.js';

const PRIORITY_ORDER = ['Critical', 'High', 'Medium', 'Low', 'Pending'];

/** Horizontal bars for a {label: count} map. Real counts from /admin/stats; widths are relative to the largest bar. */
function Distribution({ data, order, toneFor, linkFor }) {
  const entries = (order ?? Object.keys(data)).map((k) => [k, data[k] ?? 0]).filter(([, n]) => n > 0 || order);
  const max = Math.max(...entries.map(([, n]) => n), 1);
  if (!entries.some(([, n]) => n > 0)) return <p className="muted small">No open tickets.</p>;
  return (
    <ul className="bars">
      {entries.sort((a, b) => (order ? 0 : b[1] - a[1])).map(([label, n]) => (
        <li key={label} className={toneFor?.(label) ?? ''}>
          {linkFor ? <Link to={linkFor(label)} className="bar-label" title={label}>{label === 'Pending' ? 'Not scored yet' : label}</Link> : <span className="bar-label" title={label}>{label}</span>}
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="bar-n">{n}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const stats = useFetch(() => api.get('/admin/stats'), []);
  const urgent = useFetch(() => api.get('/admin/tickets', { status: 'Open,In Progress', sort: 'urgency', pageSize: 6 }), []);

  const refresh = useDebouncedCallback(() => { stats.refresh(); urgent.refresh(); }, 300);
  useLiveEvents((evt) => { if (evt.type !== 'ticket.note') refresh(); });

  if (stats.loading && !stats.data) return <PageSkeleton label="Loading dashboard…" />;
  if (stats.error) return <div className="page"><ErrorState error={stats.error} onRetry={stats.reload} /></div>;

  const s = stats.data;
  const total = Object.values(s.byStatus).reduce((a, b) => a + b, 0);
  const count = (k) => s.byStatus[k] ?? 0;
  const critical = s.openByPriority.Critical ?? 0;

  return (
    <div className="page wide">
      <PageHeader eyebrow="Support console" title={`Hello, ${firstName(user.name)}`} subtitle="A live view of the support workload. Figures update as tickets change.">
        <Link className="btn btn-primary" to="/admin">Open ticket queue<ArrowRight size={16} /></Link>
      </PageHeader>

      <div className="stats stats-4">
        <Stat label="Total tickets" value={total} icon={Inbox} hint={`${s.createdLast7Days} new in the last 7 days`} />
        <Stat label="Open" value={count('Open')} icon={CircleDot} />
        <Stat label="In progress" value={count('In Progress')} icon={Loader} />
        <Stat label="Resolved" value={count('Resolved')} icon={CheckCircle2} tone="ok" hint={`${s.resolvedLast7Days} in the last 7 days`} />
        <Stat label="Critical (open)" value={critical} icon={Flame} tone={critical ? 'danger' : ''} onClick={() => navigate('/admin?priority=Critical')} />
        <Stat label="Overdue" value={s.overdue} icon={AlertOctagon} tone={s.overdue ? 'danger' : ''} hint="No first reply within SLA" />
        <Stat label="Avg first response" value={s.avgFirstResponseHours == null ? '—' : `${s.avgFirstResponseHours}h`} icon={Gauge} />
        <Stat label="Awaiting first reply" value={s.awaitingFirstResponse} icon={TrendingUp} hint={`${s.unassignedOpen} unassigned`} tone={s.unassignedOpen ? 'warn' : ''} />
      </div>

      <div className="grid-2">
        <Card title="Open tickets by priority">
          <Distribution data={s.openByPriority} order={PRIORITY_ORDER} toneFor={(k) => `bar-${k.toLowerCase()}`} linkFor={(k) => (k === 'Pending' ? '/admin' : `/admin?priority=${k}`)} />
        </Card>
        <Card title="Open tickets by category">
          <Distribution data={s.openByCategory} linkFor={(k) => `/admin?category=${encodeURIComponent(k)}`} />
        </Card>
      </div>

      <Card title="Most urgent right now" actions={<Link className="btn btn-sm btn-ghost" to="/admin">View queue<ArrowRight size={16} /></Link>}>
        {urgent.loading && !urgent.data ? <p className="muted">Loading…</p> : (urgent.data?.items.length ?? 0) === 0 ? (
          <EmptyState icon={PlusCircle} title="Inbox zero">There are no active tickets right now.</EmptyState>
        ) : (
          <ul className="mini-list">
            {urgent.data.items.map((t) => (
              <li key={t.id}>
                <div>
                  <Link to={`/admin/tickets/${t.id}`}><strong>{t.subject}</strong></Link>
                  <span className="muted xs"><span className="mono">{t.ticketNumber}</span> · {t.author.name} · opened {timeAgo(t.createdAt)}{t.sla.overdue ? ' · ' : ''}{t.sla.overdue && <span className="text-danger">overdue</span>}</span>
                </div>
                <span className="row"><PriorityBadge priority={t.priority} /><StatusBadge status={t.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
