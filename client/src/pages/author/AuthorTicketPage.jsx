import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Send } from 'lucide-react';
import { api } from '../../api/client.js';
import { useDebouncedCallback, useFetch } from '../../api/hooks.js';
import { StatusBadge } from '../../components/Badges.jsx';
import { Alert, Card, ConfirmModal, ErrorState, PageSkeleton } from '../../components/Common.jsx';
import Conversation from '../../components/Conversation.jsx';
import { useLiveEvents } from '../../context/LiveContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate } from '../../utils/format.js';

const STEPS = ['Open', 'In Progress', 'Resolved', 'Closed'];

function StatusTimeline({ status }) {
  const idx = STEPS.indexOf(status);
  return (
    <ol className="timeline" aria-label={`Ticket status: ${status}`}>
      {STEPS.map((s, i) => (
        <li key={s} className={i < idx ? 'done' : i === idx ? 'current' : ''} aria-current={i === idx ? 'step' : undefined}>
          <span className="pip">{i < idx && <Check size={11} strokeWidth={3.5} />}</span>{s}
        </li>
      ))}
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
  const [confirmClose, setConfirmClose] = useState(false);

  // Real time: refetch when an admin replies / changes the status of THIS ticket.
  const debouncedRefresh = useDebouncedCallback(refresh, 150);
  useLiveEvents((evt) => {
    if (evt.type === 'ticket.message') toast.info('BookLeaf support replied to this ticket.');
    debouncedRefresh();
  }, { ticketId: id });

  if (loading) return <PageSkeleton label="Loading ticket…" />;
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
    setConfirmClose(false);
    try { setData(await api.post(`/tickets/${id}/close`)); toast.success('Ticket closed.'); } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="page narrow">
      <p className="crumbs"><Link to="/tickets"><ArrowLeft size={15} />My Tickets</Link></p>
      <div className="ticket-head">
        <div>
          <p className="mono muted">{ticket.ticketNumber}</p>
          <h1>{ticket.subject}</h1>
          <p className="muted">{ticket.book ? ticket.book.title : 'General / Account Level'} · opened {formatDate(ticket.createdAt, { time: true })}</p>
        </div>
        <StatusBadge status={ticket.status} />
      </div>

      <Card title="Ticket progress"><StatusTimeline status={ticket.status} /></Card>

      {messages.length === 0 && !closed && (
        <Alert kind="info">We have received your query and will reply here within 24–48 hours. This page updates automatically.</Alert>
      )}

      <Card title="Conversation">
        <Conversation ticket={ticket} messages={messages} attachments={attachments} viewerRole="author" />
      </Card>

      {closed ? (
        <Alert kind="info">This ticket is closed. <Link to="/tickets/new">Open a new query</Link> if you need more help.</Alert>
      ) : (
        <Card title={ticket.status === 'Resolved' ? 'Not fixed? Reply to reopen' : 'Add a reply'}>
          <form onSubmit={send}>
            {replyError && <Alert kind="error">{replyError}</Alert>}
            <textarea rows={4} value={reply} maxLength={5000} onChange={(e) => setReply(e.target.value)} placeholder="Write your message…" aria-label="Your reply" />
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmClose(true)}>Close ticket</button>
              <button className="btn btn-primary" disabled={busy || !reply.trim()}>{busy ? <><span className="spinner sm" />Sending…</> : <><Send size={16} />Send reply</>}</button>
            </div>
          </form>
        </Card>
      )}

      <ConfirmModal open={confirmClose} title="Close this ticket?" confirmLabel="Close ticket" onConfirm={close} onCancel={() => setConfirmClose(false)}>
        <p>You can open a new query any time if you need more help.</p>
      </ConfirmModal>
    </div>
  );
}
