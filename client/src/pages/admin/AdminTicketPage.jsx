import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useDebouncedCallback, useFetch } from '../../api/hooks.js';
import { useMeta } from '../../api/meta.js';
import { CategoryBadge, PriorityBadge, SourceTag, StatusBadge } from '../../components/Badges.jsx';
import { Card, ErrorState, Spinner } from '../../components/Common.jsx';
import Conversation from '../../components/Conversation.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLiveEvents } from '../../context/LiveContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate, inr, timeAgo } from '../../utils/format.js';

// ---------------------------------------------------------------------------------------------
// Reply composer with the AI draft
// ---------------------------------------------------------------------------------------------
function Composer({ ticketId, ticket, messages, onSent }) {
  const toast = useToast();
  const [tab, setTab] = useState('reply');
  const [text, setText] = useState('');
  const [fromDraft, setFromDraft] = useState(false);
  const [draft, setDraft] = useState(null);            // latest draft from the server
  const [pendingDraft, setPendingDraft] = useState(null); // a newer draft that arrived while the admin was editing
  const [draftState, setDraftState] = useState('idle');  // idle | loading | ready | error
  const [draftError, setDraftError] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');
  const lastApplied = useRef('');
  const textRef = useRef('');
  textRef.current = text;

  const lastRole = messages.at(-1)?.senderRole ?? 'author';
  const triagePending = ticket.aiStatus === 'pending';

  const applyDraft = useCallback((d) => {
    setDraft(d);
    // Never overwrite what the admin is writing: only replace an untouched composer.
    if (!textRef.current.trim() || textRef.current === lastApplied.current) {
      setText(d.body); lastApplied.current = d.body; setFromDraft(true); setPendingDraft(null);
    } else setPendingDraft(d);
  }, []);

  const loadDraft = useCallback(async ({ regenerate = false } = {}) => {
    setDraftState('loading'); setDraftError('');
    try {
      const d = regenerate ? await api.post(`/admin/tickets/${ticketId}/draft`) : await api.get(`/admin/tickets/${ticketId}/draft`);
      applyDraft(d); setDraftState('ready');
      if (regenerate && d.source === 'template') toast.info('AI is unavailable right now - showing a template draft.');
    } catch (err) {
      setDraftState('error'); setDraftError(err.message);
    }
  }, [ticketId, applyDraft, toast]);

  // Auto-draft when the ball is in our court (author wrote last) and triage has finished.
  // If an admin already replied last, we do NOT spend an LLM call unless they ask for one.
  useEffect(() => {
    if (triagePending || lastRole === 'admin') return;
    loadDraft();
  }, [ticketId, messages.length, ticket.category, triagePending, lastRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (setStatus) => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const updated = await api.post(`/admin/tickets/${ticketId}/messages`, { body: text.trim(), aiAssisted: fromDraft && draft?.source === 'ai', setStatus });
      toast.success(setStatus === 'Resolved' ? 'Reply sent and ticket resolved.' : 'Reply sent to the author.');
      setText(''); lastApplied.current = ''; setFromDraft(false); setPendingDraft(null); setDraft(null); setDraftState('idle');
      onSent(updated);
    } catch (err) { toast.error(err.message); } finally { setSending(false); }
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    try { await api.post(`/admin/tickets/${ticketId}/notes`, { body: note.trim() }); setNote(''); toast.success('Internal note added.'); onSent(); }
    catch (err) { toast.error(err.message); }
  };

  const isTemplate = draft?.source === 'template';

  return (
    <Card className="composer">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'reply'} className={`tab ${tab === 'reply' ? 'active' : ''}`} onClick={() => setTab('reply')}>Reply to author</button>
        <button role="tab" aria-selected={tab === 'notes'} className={`tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
          Internal notes <span className="count">{ticket.notes?.length ?? 0}</span>
        </button>
      </div>

      {tab === 'reply' ? (
        <div>
          <div className={`draft-bar ${isTemplate ? 'draft-template' : 'draft-ai'}`} aria-busy={draftState === 'loading'}>
            <div>
              {draftState === 'loading' && <span><span className="spinner sm" /> Drafting a reply from the knowledge base and this author's data…</span>}
              {draftState === 'ready' && draft && (isTemplate
                ? <span>📄 <strong>Template draft</strong> - the AI is unavailable, so this was built from BookLeaf policy. Review it carefully.</span>
                : <span>✨ <strong>AI draft</strong> <span className="muted small">· {draft.model} · {draft.cached ? 'saved draft' : 'just generated'} · {timeAgo(draft.generatedAt)}</span></span>)}
              {draftState === 'error' && <span className="text-danger">Could not load a draft: {draftError}. You can write the reply manually.</span>}
              {draftState === 'idle' && <span className="muted">{lastRole === 'admin' ? 'You replied last - write a follow-up, or generate a draft.' : 'Draft will appear here.'}</span>}
            </div>
            <div className="draft-actions">
              {fromDraft && draft && text !== draft.body && <button className="btn btn-sm btn-ghost" onClick={() => { setText(draft.body); lastApplied.current = draft.body; }}>Reset to draft</button>}
              <button className="btn btn-sm" disabled={draftState === 'loading'} onClick={() => loadDraft({ regenerate: true })}>
                {draftState === 'idle' ? 'Generate AI draft' : 'Regenerate'}
              </button>
            </div>
          </div>

          {draft?.notes?.length > 0 && (
            <div className="alert alert-warn draft-notes"><strong>Before you send:</strong>
              <ul>{draft.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}

          {pendingDraft && (
            <div className="alert alert-info">
              The conversation changed and a newer draft is ready.{' '}
              <button className="link" onClick={() => { setText(pendingDraft.body); lastApplied.current = pendingDraft.body; setFromDraft(true); setPendingDraft(null); }}>Replace my text with it</button>
              {' · '}<button className="link" onClick={() => setPendingDraft(null)}>Keep mine</button>
            </div>
          )}

          <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000}
            placeholder={draftState === 'loading' ? 'Drafting…' : 'Write your reply to the author…'} aria-label="Reply to author" />
          <div className="form-actions between">
            <span className="muted small">{text.length}/5000 · {fromDraft && !isTemplate ? 'Started from AI draft · you are responsible for the final text' : 'Visible to the author immediately'}</span>
            <div>
              <button className="btn" disabled={sending || !text.trim()} onClick={() => send('Resolved')}>Send &amp; resolve</button>{' '}
              <button className="btn btn-primary" disabled={sending || !text.trim()} onClick={() => send(undefined)}>{sending ? 'Sending…' : 'Send reply'}</button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <p className="muted small">🔒 Internal notes are only visible to the support team - never to the author.</p>
          <form onSubmit={addNote}>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Finance confirmed the payout is scheduled for 14 Nov…" aria-label="Internal note" />
            <div className="form-actions"><button className="btn btn-primary" disabled={!note.trim()}>Add note</button></div>
          </form>
          <ul className="notes">
            {(ticket.notes ?? []).map((n) => (
              <li key={n.id}><div className="muted small"><strong>{n.authorName.replace(/\s*\(.*\)$/, '')}</strong> · {timeAgo(n.createdAt)}</div><p>{n.body}</p></li>
            ))}
            {!ticket.notes?.length && <li className="muted">No notes yet.</li>}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------
export default function AdminTicketPage() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const toast = useToast();
  const meta = useMeta();
  const { data, error, loading, reload, refresh, setData } = useFetch(() => api.get(`/admin/tickets/${id}`), [id]);
  const admins = useFetch(() => api.get('/admin/admins'), []);

  const debouncedRefresh = useDebouncedCallback(refresh, 200);
  useLiveEvents((evt) => {
    if (evt.type === 'ticket.message') toast.info('The author replied to this ticket.');
    debouncedRefresh();
  }, { ticketId: id });

  if (loading && !data) return <Spinner label="Loading ticket…" />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;

  const { ticket, messages, notes, activity, attachments, author, books, selectedBook } = data;
  const closed = ticket.status === 'Closed';

  const patch = async (body, okMessage) => {
    try { setData(await api.patch(`/admin/tickets/${id}`, body)); if (okMessage) toast.success(okMessage); }
    catch (err) { toast.error(err.message); }
  };
  const rerunAi = async () => {
    if (!window.confirm('Re-run AI classification? This replaces any category/priority you set manually.')) return;
    try { setData(await api.post(`/admin/tickets/${id}/reclassify`)); toast.success('Re-classified.'); } catch (err) { toast.error(err.message); }
  };

  const sla = ticket.sla;
  const slaText = sla.waitingForFirstResponse
    ? (sla.overdue ? `Overdue - first reply was due ${timeAgo(sla.dueAt)}` : `First reply due ${formatDate(sla.dueAt, { time: true })}`)
    : ticket.firstResponseAt ? `First replied ${timeAgo(ticket.firstResponseAt)}` : '—';

  return (
    <div className="page wide">
      <p className="crumbs"><Link to="/admin">← Ticket queue</Link></p>
      <div className="ticket-head">
        <div>
          <p className="mono muted">{ticket.ticketNumber} · opened {formatDate(ticket.createdAt, { time: true })}</p>
          <h1>{ticket.subject}</h1>
          <p className="muted">{author.name} · {ticket.book ? ticket.book.title : 'General / Account Level'}</p>
        </div>
        <div className="head-badges"><PriorityBadge priority={ticket.priority} /><CategoryBadge category={ticket.category} /><StatusBadge status={ticket.status} /></div>
      </div>

      {ticket.aiStatus === 'fallback' && (
        <div className="alert alert-warn">⚠️ The AI was unavailable when this ticket arrived, so category and priority were set by keyword rules. Please review them in the panel on the right.</div>
      )}

      <div className="admin-grid">
        <div className="admin-main">
          <Card title="Conversation">
            <Conversation ticket={ticket} messages={messages} attachments={attachments} viewerRole="admin" authorName={author.name} />
          </Card>

          {closed ? (
            <div className="alert alert-info">This ticket is closed. <button className="link" onClick={() => patch({ status: 'Open' }, 'Ticket reopened.')}>Reopen it</button> to reply.</div>
          ) : (
            <Composer ticketId={id} ticket={{ ...ticket, notes }} messages={messages} onSent={(updated) => (updated ? setData(updated) : refresh())} />
          )}
        </div>

        <aside className="admin-side">
          <Card title="Ticket">
            <label className="side-label" htmlFor="status">Status</label>
            <select id="status" value={ticket.status} onChange={(e) => patch({ status: e.target.value }, 'Status updated.')}>
              {meta?.statuses.map((s) => <option key={s}>{s}</option>)}
            </select>

            <label className="side-label">Assigned to</label>
            <div className="assign">
              <strong>{ticket.assignedTo ? ticket.assignedTo.name.replace(/\s*\(.*\)$/, '') : 'Unassigned'}</strong>
              {ticket.assignedTo?.id !== user.id && <button className="btn btn-sm" onClick={() => patch({ assignedTo: 'me' }, 'Assigned to you.')}>Assign to me</button>}
              {ticket.assignedTo && <button className="btn btn-sm btn-ghost" onClick={() => patch({ assignedTo: null }, 'Unassigned.')}>Unassign</button>}
            </div>
            {(admins.data?.items.length ?? 0) > 1 && (
              <select aria-label="Assign to another admin" value="" onChange={(e) => e.target.value && patch({ assignedTo: Number(e.target.value) }, 'Reassigned.')}>
                <option value="">Reassign to…</option>
                {admins.data.items.filter((a) => a.id !== ticket.assignedTo?.id).map((a) => <option key={a.id} value={a.id}>{a.name.replace(/\s*\(.*\)$/, '')}</option>)}
              </select>
            )}

            <div className="sla"><span className={sla.overdue ? 'text-danger' : 'muted'}>⏱ {slaText}</span></div>
          </Card>

          <Card title="AI triage" actions={<button className="btn btn-sm btn-ghost" onClick={rerunAi} title="Run the AI classifier again">Re-run AI</button>}>
            <label className="side-label" htmlFor="category">Category <SourceTag source={ticket.categorySource} /></label>
            <select id="category" value={ticket.category ?? ''} onChange={(e) => patch({ category: e.target.value }, 'Category updated.')}>
              {!ticket.category && <option value="">Classifying…</option>}
              {meta?.categories.map((c) => <option key={c}>{c}</option>)}
            </select>

            <label className="side-label" htmlFor="priority">Priority <SourceTag source={ticket.prioritySource} /></label>
            <select id="priority" value={ticket.priority ?? ''} onChange={(e) => patch({ priority: e.target.value }, 'Priority updated.')}>
              {!ticket.priority && <option value="">Scoring…</option>}
              {meta?.priorities.map((p) => <option key={p}>{p}</option>)}
            </select>

            {ticket.aiRationale && (
              <p className="rationale muted small">
                <strong>Why:</strong> {ticket.aiRationale}
                {ticket.aiConfidence != null && ticket.categorySource === 'ai' && <> · confidence {Math.round(ticket.aiConfidence * 100)}%</>}
              </p>
            )}
          </Card>

          <Card title="Author">
            <p><strong>{author.name}</strong><br /><a href={`mailto:${author.email}`}>{author.email}</a></p>
            <p className="muted small">{author.city} · {author.phone} · joined {formatDate(author.joinedDate)}</p>
            <ul className="mini-books">
              {books.map((b) => (
                <li key={b.bookId} className={selectedBook?.bookId === b.bookId ? 'selected' : ''}>
                  <strong>{b.title}</strong>
                  <span className="muted small">{b.status}</span>
                  {b.isPublished
                    ? <span className="small">{b.totalCopiesSold} sold · earned {inr(b.totalRoyaltyEarned)} · paid {inr(b.royaltyPaid)} · <strong>pending {inr(b.royaltyPending)}</strong></span>
                    : <span className="small muted">Not published yet</span>}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Activity">
            <ul className="activity">
              {activity.map((a) => (
                <li key={a.id}>
                  <span className="act-action">{a.action.replaceAll('_', ' ')}</span>
                  {a.detail && <span className="muted small"> — {a.detail}</span>}
                  <div className="muted small">{a.actorName} · {timeAgo(a.createdAt)}</div>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
