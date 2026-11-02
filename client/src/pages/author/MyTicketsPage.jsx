import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, Clock, MessageSquare, MessageSquarePlus } from 'lucide-react';
import { api } from '../../api/client.js';
import { useDebouncedCallback, useFetch } from '../../api/hooks.js';
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from '../../components/Common.jsx';
import { StatusBadge } from '../../components/Badges.jsx';
import { useLiveEvents } from '../../context/LiveContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { timeAgo } from '../../utils/format.js';

const TABS = ['All', 'Open', 'In Progress', 'Resolved', 'Closed'];

export default function MyTicketsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('All');
  const { data, error, loading, reload, refresh } = useFetch(() => api.get('/tickets', { pageSize: 100 }), []);

  // Real time: any change to one of my tickets re-fetches the list (debounced).
  const debouncedRefresh = useDebouncedCallback(refresh, 200);
  useLiveEvents((evt) => {
    if (evt.type === 'ticket.message') toast.info('You have a new reply from BookLeaf support.');
    debouncedRefresh();
  });

  const items = data?.items ?? [];
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t, t === 'All' ? items.length : items.filter((i) => i.status === t).length])), [items]);
  const visible = tab === 'All' ? items : items.filter((i) => i.status === tab);

  if (loading) return <PageSkeleton label="Loading your tickets…" />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;

  return (
    <div className="page narrow">
      <PageHeader eyebrow="Support" title="My Tickets" subtitle="Your conversations with the BookLeaf support team.">
        <Link className="btn btn-primary" to="/tickets/new"><MessageSquarePlus size={18} />New query</Link>
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState icon={MessageSquare} title="You have not raised any tickets" action={{ to: '/tickets/new', label: 'Submit your first query' }}>
          Questions about royalties, ISBNs, printing or your book's status? We are here to help.
        </EmptyState>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t} <span className="count">{counts[t]}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={MessageSquare} title={`No ${tab.toLowerCase()} tickets`}>Nothing here right now.</EmptyState>
          ) : (
            <ul className="ticket-list">
              {visible.map((t) => (
                <li key={t.id}>
                  <Link to={`/tickets/${t.id}`} className={`ticket-row ${t.awaitingYourReply ? 'unread' : ''}`}>
                    <div className="ticket-main">
                      <div className="ticket-top">
                        <span className="mono muted">{t.ticketNumber}</span>
                        <StatusBadge status={t.status} />
                        {t.awaitingYourReply && <span className="badge badge-new plain">New reply</span>}
                      </div>
                      <h3>{t.subject}</h3>
                      <p className="muted clamp">{t.description}</p>
                      <p className="muted xs ticket-meta">
                        <span><BookOpen size={13} />{t.book ? t.book.title : 'General / Account Level'}</span>
                        <span><MessageSquare size={13} />{t.messageCount} repl{t.messageCount === 1 ? 'y' : 'ies'}</span>
                        <span><Clock size={13} />Updated {timeAgo(t.updatedAt)}</span>
                      </p>
                    </div>
                    <ChevronRight className="ticket-chevron" size={20} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
