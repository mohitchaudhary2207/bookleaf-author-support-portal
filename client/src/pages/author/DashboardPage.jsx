import { Link } from 'react-router-dom';
import { ArrowRight, BookCheck, BookOpen, Hammer, Hourglass, LifeBuoy, MessageSquare, PiggyBank, Wallet } from 'lucide-react';
import { api } from '../../api/client.js';
import { useDebouncedCallback, useFetch } from '../../api/hooks.js';
import { StatusBadge } from '../../components/Badges.jsx';
import { Alert, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Stat } from '../../components/Common.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLiveEvents } from '../../context/LiveContext.jsx';
import { firstName, inr, timeAgo } from '../../utils/format.js';

const ACTIVE = ['Open', 'In Progress'];

export default function DashboardPage() {
  const { user } = useAuth();
  const books = useFetch(() => api.get('/books'), []);
  const tickets = useFetch(() => api.get('/tickets', { pageSize: 100 }), []);

  const refresh = useDebouncedCallback(() => tickets.refresh(), 200);
  useLiveEvents(() => refresh());

  if (books.loading && !books.data) return <PageSkeleton label="Loading your dashboard…" />;
  if (books.error) return <div className="page"><ErrorState error={books.error} onRetry={books.reload} /></div>;

  const { items, summary } = books.data;
  const myTickets = tickets.data?.items ?? [];
  const active = myTickets.filter((t) => ACTIVE.includes(t.status));
  const waiting = myTickets.filter((t) => t.awaitingYourReply);
  const recent = [...myTickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const earned = summary.totalRoyaltyEarned;
  const topEarned = Math.max(...items.map((b) => b.totalRoyaltyEarned ?? 0), 1);

  return (
    <div className="page">
      <PageHeader eyebrow="Author dashboard" title={`Welcome back, ${firstName(user.name)}`} subtitle="Where your books, royalties and support requests stand today.">
        <Link className="btn btn-primary" to="/tickets/new"><LifeBuoy size={18} />Get support</Link>
      </PageHeader>

      {waiting.length > 0 && (
        <Alert kind="info">
          <strong>{waiting.length === 1 ? 'BookLeaf support has replied to one of your tickets.' : `BookLeaf support has replied to ${waiting.length} of your tickets.`}</strong>{' '}
          <Link to={`/tickets/${waiting[0].id}`}>Read the reply</Link>
        </Alert>
      )}

      {items.length === 0 ? (
        <EmptyState icon={BookOpen} title="No books on your account yet" action={{ to: '/tickets/new', label: 'Contact support' }}>
          Once your manuscript is received, your book will appear here with its production progress.
        </EmptyState>
      ) : (
        <>
          <div className="stats stats-4">
            <Stat label="Total books" value={summary.totalBooks} icon={BookOpen} hint={`${summary.totalCopiesSold.toLocaleString('en-IN')} copies sold`} />
            <Stat label="Published" value={summary.published} icon={BookCheck} tone="ok" hint="Live on at least one platform" />
            <Stat label="In production" value={summary.inProduction} icon={Hammer} />
            <Stat label="Active tickets" value={tickets.data ? active.length : '—'} icon={MessageSquare} hint={tickets.data ? `${myTickets.length} in total` : undefined} />
          </div>
          <div className="stats stats-3">
            <Stat label="Royalties earned" value={inr(summary.totalRoyaltyEarned)} icon={Wallet} />
            <Stat label="Royalties paid" value={inr(summary.totalRoyaltyPaid)} icon={PiggyBank} tone="ok" />
            <Stat label="Pending royalties" value={inr(summary.totalRoyaltyPending)} icon={Hourglass} tone={summary.totalRoyaltyPending > 0 ? 'warn' : ''} hint="Paid within 45 days of quarter end" />
          </div>

          <div className="grid-2">
            <Card title="Royalty overview" icon={Wallet} actions={<Link className="btn btn-sm btn-ghost" to="/books">All books<ArrowRight size={16} /></Link>}>
              {earned > 0 ? (
                <>
                  <div className="meter" role="img" aria-label={`${inr(summary.totalRoyaltyPaid)} paid and ${inr(summary.totalRoyaltyPending)} pending of ${inr(earned)} earned`}>
                    <span className="meter-paid" style={{ width: `${(summary.totalRoyaltyPaid / earned) * 100}%` }} />
                    <span className="meter-pending" style={{ width: `${(summary.totalRoyaltyPending / earned) * 100}%` }} />
                  </div>
                  <div className="legend">
                    <span><i style={{ background: 'var(--ok)' }} />Paid {inr(summary.totalRoyaltyPaid)}</span>
                    <span><i style={{ background: 'var(--brand-500)' }} />Pending {inr(summary.totalRoyaltyPending)}</span>
                    <span className="muted">of {inr(earned)} earned</span>
                  </div>
                  <ul className="book-rows">
                    {items.filter((b) => b.isPublished).map((b) => (
                      <li key={b.bookId}>
                        <span className="book-rows-title">{b.title}</span>
                        <span className="bars bars-inline"><span className="bar-track"><span className="bar-fill" style={{ width: `${((b.totalRoyaltyEarned ?? 0) / topEarned) * 100}%` }} /></span></span>
                        <span className="book-rows-n">{inr(b.totalRoyaltyEarned)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p className="muted">No royalties have been earned yet. They start once a book is live and selling.</p>}
            </Card>

            <Card title="Your books" icon={BookOpen} actions={<Link className="btn btn-sm btn-ghost" to="/books">Details<ArrowRight size={16} /></Link>}>
              <ul className="mini-list">
                {items.map((b) => (
                  <li key={b.bookId}>
                    <div>
                      <strong>{b.title}</strong>
                      <span className="muted xs">{b.genre}{b.isPublished ? ` · ${b.totalCopiesSold.toLocaleString('en-IN')} sold` : ''}</span>
                    </div>
                    <span className={`badge ${b.isPublished ? 'status-resolved' : 'status-in-progress'}`}>{b.isPublished ? 'Published' : b.productionStage ?? b.status}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      <Card title="Recent support activity" icon={MessageSquare} actions={<Link className="btn btn-sm btn-ghost" to="/tickets">All tickets<ArrowRight size={16} /></Link>}>
        {tickets.loading && !tickets.data ? <p className="muted">Loading…</p> : recent.length === 0 ? (
          <p className="muted">You have not raised any tickets. Questions about royalties, ISBNs, printing or a book's status? <Link to="/tickets/new">Ask the team</Link>.</p>
        ) : (
          <ul className="mini-list">
            {recent.map((t) => (
              <li key={t.id}>
                <div>
                  <Link to={`/tickets/${t.id}`}><strong>{t.subject}</strong></Link>
                  <span className="muted xs"><span className="mono">{t.ticketNumber}</span> · {t.book ? t.book.title : 'General'} · updated {timeAgo(t.updatedAt)}</span>
                </div>
                <span className="row">{t.awaitingYourReply && <span className="badge badge-new plain">New reply</span>}<StatusBadge status={t.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
