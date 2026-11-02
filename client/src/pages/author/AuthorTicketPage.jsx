import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useDebouncedCallback, useFetch } from '../../api/hooks.js';
import { StatusBadge } from '../../components/Badges.jsx';
import { Card, ErrorState, Spinner } from '../../components/Common.jsx';
import Conversation from '../../components/Conversation.jsx';
import { useLiveEvents } from '../../context/LiveContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate } from '../../utils/format.js';

const STEPS = ['Open', 'In Progress', 'Resolved', 'Closed'];

function StatusTimeline({ status }) {
  const idx = STEPS.indexOf(status);
  return (
    <ol className="timeline" aria-label={`Ticket status: ${status}`}>
      {STEPS.map((s, i) => <li key={s} className={i < idx ? 'done' : i === idx ? 'current' : ''}><span className="pip" />{s}</li>)}
    </ol>
  );
}

export default function AuthorTicketPage() {
  const id = Number(useParams().id);
  const toast = useToast();
  const { data, error, loading, reload, refresh, setData } = useFetch(() => api.get(`/tickets/${id}`), [id]);
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState('');
  const [busy, setBusy] = useState(false);

  // Real time: refetch when an admin replies / changes the status of THIS ticket.
  const debouncedRefresh = useDebouncedCallback(refresh, 150);
  useLiveEvents((evt) => {
    if (evt.type === 'ticket.message') toast.info('BookLeaf support replied to this ticket.');
    debouncedRefresh();
  }, { ticketId: id });

  if (loading) return <Spinner label="Loading ticket…" />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;

  const { ticket, messages, attachments } = data;
  const closed = ticket.status === 'Closed';

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true); setReplyError('');
    try {
      setData(await api.post(`/tickets/${id}/messages`, { body: reply.trim() }));
      setReply('');
    } catch (err) {
      setReplyError(err.message);
    } finally { setBusy(false); }
  };

  const close = async () => {
    if (!window.confirm('Close this ticket? You can open a new one any time.')) return;
    try { setData(await api.post(`/tickets/${id}/close`)); toast.success('Ticket closed.'); } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="page narrow">
      <p className="crumbs"><Link to="/tickets">← My Tickets</Link></p>
      <div className="ticket-head">
        <div>
          <p className="mono muted">{ticket.ticketNumber}</p>
          <h1>{ticket.subject}</h1>
          <p className="muted">{ticket.book ? ticket.book.title : 'General / Account Level'} · opened {formatDate(ticket.createdAt, { time: true })}</p>
        </div>
        <StatusBadge status={ticket.status} />
      </div>

      <Card><StatusTimeline status={ticket.status} /></Card>

      {messages.length === 0 && !closed && (
        <div className="alert alert-info">We have received your query and will reply here within 24–48 hours. This page updates automatically.</div>
      )}

      <Card title="Conversation">
        <Conversation ticket={ticket} messages={messages} attachments={attachments} viewerRole="author" />
      </Card>

      {closed ? (
        <div className="alert alert-info">This ticket is closed. <Link to="/tickets/new">Open a new query</Link> if you need more help.</div>
      ) : (
        <Card title={ticket.status === 'Resolved' ? 'Not fixed? Reply to reopen' : 'Add a reply'}>
          <form onSubmit={send}>
            {replyError && <div className="alert alert-error" role="alert">{replyError}</div>}
            <textarea rows={4} value={reply} maxLength={5000} onChange={(e) => setReply(e.target.value)} placeholder="Write your message…" aria-label="Your reply" />
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={close}>Close ticket</button>
              <button className="btn btn-primary" disabled={busy || !reply.trim()}>{busy ? 'Sending…' : 'Send reply'}</button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
