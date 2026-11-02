import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Clock, FileText, Lock, RefreshCw, RotateCcw, Send, Sparkles, StickyNote, Undo2, User } from 'lucide-react';
import { api } from '../../api/client.js';
import { useDebouncedCallback, useFetch } from '../../api/hooks.js';
import { useMeta } from '../../api/meta.js';
import { CategoryBadge, PriorityBadge, SourceTag, StatusBadge } from '../../components/Badges.jsx';
import { Alert, Card, ConfirmModal, ErrorState, PageSkeleton } from '../../components/Common.jsx';
import Conversation from '../../components/Conversation.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLiveEvents } from '../../context/LiveContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate, inr, timeAgo } from '../../utils/format.js';

const clean = (name = '') => name.replace(/\s*\(.*\)$/, '');
const AI_OFF_REASON = {
  disabled: 'AI is switched off.',
  not_configured: 'No AI key is configured.',
  cooling_down: 'AI calls are paused after repeated failures.',
};

// ---------------------------------------------------------------------------------------------
// Reply composer. The AI draft is created ONLY when the admin clicks "Generate AI Response".
// Opening a ticket makes a read-only request for an already-saved draft (no LLM call, no tokens).
// ---------------------------------------------------------------------------------------------
function ReplyComposer({ ticketId, messages, onSent, aiStatus }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [fromDraft, setFromDraft] = useState(false);
  const [draft, setDraft] = useState(null);
  const [phase, setPhase] = useState('idle');       // idle | generating | error
  const [genError, setGenError] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const lastApplied = useRef('');                    // the draft text last placed in the editor
  const textRef = useRef('');
  const loadedFor = useRef(null);                    // ticket whose saved draft was already placed in the editor
  const ignore = useRef(null);                       // generatedAt of a draft already sent/dismissed
  textRef.current = text;

  const isDirty = () => textRef.current.trim() !== '' && textRef.current !== lastApplied.current;

  const place = useCallback((d) => {
    setText(d.body); lastApplied.current = d.body; setFromDraft(true);
  }, []);

  // READ-ONLY: look for a draft that was generated earlier. 204 -> nothing saved -> show the empty state.
  const readSaved = useCallback(async () => {
    try {
      const d = await api.get(`/admin/tickets/${ticketId}/draft`);
      if (!d || d.generatedAt === ignore.current) { setDraft(null); return; }
      setDraft(d);
      if (loadedFor.current !== ticketId && !textRef.current.trim()) place(d); // show it, never overwrite typing
      loadedFor.current = ticketId;
    } catch { /* a missing/closed draft is not an error for the composer */ }
  }, [ticketId, place]);

  // Runs on open and whenever the conversation changes (to refresh the "stale" flag). Never generates.
  useEffect(() => { readSaved(); }, [ticketId, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const runGenerate = async () => {
    setConfirmReplace(false);
    setPhase('generating'); setGenError('');
    try {
      const d = await api.post(`/admin/tickets/${ticketId}/draft`);
      setDraft(d); place(d); setPhase('idle'); loadedFor.current = ticketId;
      if (d.source === 'template') toast.info('AI is unavailable right now - a policy template draft was prepared instead.');
      else toast.success('AI draft ready. Review and edit it before sending.');
    } catch (err) {
      setPhase('error'); setGenError(err.message); toast.error(`Could not generate a draft: ${err.message}`);
    }
  };
  const onGenerateClick = () => { if (phase !== 'generating') (isDirty() ? setConfirmReplace(true) : runGenerate()); };

  const send = async (setStatus) => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const updated = await api.post(`/admin/tickets/${ticketId}/messages`, { body: text.trim(), aiAssisted: fromDraft && draft?.source === 'ai', setStatus });
      toast.success(setStatus === 'Resolved' ? 'Reply sent and ticket resolved.' : 'Reply sent to the author.');
      ignore.current = draft?.generatedAt ?? null;
      setText(''); lastApplied.current = ''; setFromDraft(false); setDraft(null); setPhase('idle');
      onSent(updated);
    } catch (err) { toast.error(err.message); } finally { setSending(false); }
  };

  const generating = phase === 'generating';
  const isTemplate = draft?.source === 'template';
  const edited = fromDraft && draft && text !== draft.body;
  const authorship = !fromDraft ? 'Written by you' : edited ? (isTemplate ? 'Template draft · edited by you' : 'AI draft · edited by you') : (isTemplate ? 'Template draft' : 'AI draft');
  const aiUnavailable = aiStatus && !aiStatus.available;

  return (
    <Card title="Reply to author" icon={Send}>
      <section className={`ai-panel ${isTemplate ? 'is-template' : ''}`} aria-label="AI response assistant" aria-busy={generating}>
        {!draft && !generating && phase !== 'error' && (
          <div className="ai-empty">
            <span className="ai-orb" aria-hidden><Sparkles size={20} /></span>
            <div className="ai-empty-text">
              <strong>Need help responding to this author?</strong>
              <p className="muted small">Generate an AI-crafted response using the BookLeaf Knowledge Base and ticket context.</p>
              {aiUnavailable && <p className="small ai-warn">{AI_OFF_REASON[aiStatus.reason] ?? 'AI is currently unavailable.'} A policy-template draft will be prepared instead.</p>}
            </div>
            <button className="btn btn-ai" onClick={onGenerateClick}><Sparkles size={16} />Generate AI Response</button>
          </div>
        )}

        {generating && (
          <div className="ai-generating" role="status">
            <div className="row"><span className="spinner sm" /><strong>Generating a response…</strong></div>
            <p className="muted small">Reading the conversation, the author's book data and the BookLeaf policy. This usually takes a few seconds.</p>
            <span className="skeleton skel-line" /><span className="skeleton skel-line" style={{ width: '82%' }} /><span className="skeleton skel-line" style={{ width: '64%' }} />
            <button className="btn btn-ai" disabled><span className="spinner sm" />Generating…</button>
          </div>
        )}

        {phase === 'error' && !generating && (
          <div className="ai-error" role="alert">
            <Alert kind="error"><strong>The AI response could not be generated.</strong> {genError} You can try again, or write the reply yourself below.</Alert>
            <button className="btn btn-ai btn-sm" onClick={onGenerateClick}><RotateCcw size={15} />Try again</button>
          </div>
        )}

        {draft && !generating && (
          <div className="ai-ready">
            <div className="ai-bar">
              <span className="ai-bar-title">
                {isTemplate ? <FileText size={16} /> : <Sparkles size={16} />}
                <strong>{isTemplate ? 'Template draft' : 'AI-generated draft'}</strong>
                <span className="muted xs">{isTemplate ? 'AI unavailable · built from BookLeaf policy' : `${draft.model} · ${draft.cached ? 'saved draft' : 'just generated'}`} · {timeAgo(draft.generatedAt)}</span>
              </span>
              <span className="row">
                {edited && <button className="btn btn-sm btn-ghost" onClick={() => place(draft)}><Undo2 size={15} />Reset to draft</button>}
                <button className="btn btn-sm" onClick={onGenerateClick}><RefreshCw size={15} />Regenerate</button>
              </span>
            </div>
            {isTemplate && <p className="small ai-warn">The AI was unavailable, so this was built from BookLeaf policy. Review it carefully. {draft.aiAvailable && 'The AI is available again - regenerate for a tailored draft.'}</p>}
            {draft.stale && <Alert kind="warn">The conversation or ticket changed after this draft was written. Review it, or regenerate for an up-to-date draft.</Alert>}
            {draft.notes?.length > 0 && (
              <div className="ai-notes"><strong>Before you send</strong><ul>{draft.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
            )}
          </div>
        )}
      </section>

      <div className="composer-label">
        <label htmlFor="reply-text">Your reply</label>
        <span className={`badge plain ${fromDraft && !edited ? 'badge-ai' : 'badge-neutral'}`}>{fromDraft && !edited && <Sparkles size={11} />}{authorship}</span>
      </div>
      <textarea id="reply-text" className={`composer-text ${fromDraft && !edited ? 'is-ai' : ''}`} rows={12} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000}
        placeholder={generating ? 'Generating a response…' : 'Write your reply to the author, or generate an AI draft above…'} aria-label="Reply to author" />
      <div className="form-actions between">
        <span className="muted xs">{text.length}/5000 · {fromDraft && !isTemplate ? 'Started from an AI draft · you are responsible for the final text' : 'Visible to the author as soon as you send it'}</span>
        <span className="row">
          <button className="btn" disabled={sending || !text.trim()} onClick={() => send('Resolved')}>Send &amp; resolve</button>
          <button className="btn btn-primary" disabled={sending || !text.trim()} onClick={() => send(undefined)}>{sending ? <><span className="spinner sm" />Sending…</> : <><Send size={16} />Send reply</>}</button>
        </span>
      </div>

      <ConfirmModal open={confirmReplace} title="Replace your text with a new draft?" confirmLabel="Generate & replace" onConfirm={runGenerate} onCancel={() => setConfirmReplace(false)}>
        <p>You have edited the reply. Generating again uses AI tokens and replaces what is in the editor.</p>
      </ConfirmModal>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Internal notes (never shown to authors)
// ---------------------------------------------------------------------------------------------
function InternalNotes({ ticketId, notes, onChanged }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const add = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    try { await api.post(`/admin/tickets/${ticketId}/notes`, { body: note.trim() }); setNote(''); toast.success('Internal note added.'); onChanged(); }
    catch (err) { toast.error(err.message); }
  };
  return (
    <Card title="Internal notes" icon={StickyNote} className="notes-card" actions={<span className="badge badge-warn plain"><Lock size={11} />Team only</span>}>
      <p className="muted small">Only the support team can see these. They are never shown to the author.</p>
      <form onSubmit={add}>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Finance confirmed the payout is scheduled for 14 Nov…" aria-label="Internal note" />
        <div className="form-actions"><button className="btn btn-primary btn-sm" disabled={!note.trim()}>Add note</button></div>
      </form>
      <ul className="notes">
        {notes.map((n) => (
          <li key={n.id}><div className="muted xs"><strong>{clean(n.authorName)}</strong> · {timeAgo(n.createdAt)}</div><p>{n.body}</p></li>
        ))}
        {!notes.length && <li className="muted small notes-empty">No notes yet.</li>}
      </ul>
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
  const aiStatus = useFetch(() => api.get('/admin/ai/status'), []);
  const [confirmRerun, setConfirmRerun] = useState(false);

  const debouncedRefresh = useDebouncedCallback(refresh, 200);
  useLiveEvents((evt) => {
    if (evt.type === 'ticket.message') toast.info('The author replied to this ticket.');
    debouncedRefresh();
  }, { ticketId: id });

  if (loading && !data) return <PageSkeleton label="Loading ticket…" />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;

  const { ticket, messages, notes, activity, attachments, author, books, selectedBook } = data;
  const closed = ticket.status === 'Closed';

  const patch = async (body, okMessage) => {
    try { setData(await api.patch(`/admin/tickets/${id}`, body)); if (okMessage) toast.success(okMessage); }
    catch (err) { toast.error(err.message); }
  };
  const rerunAi = async () => {
    setConfirmRerun(false);
    try { setData(await api.post(`/admin/tickets/${id}/reclassify`)); toast.success('Re-classified.'); } catch (err) { toast.error(err.message); }
  };

  const sla = ticket.sla;
  const slaText = sla.waitingForFirstResponse
    ? (sla.overdue ? `Overdue - first reply was due ${timeAgo(sla.dueAt)}` : `First reply due ${formatDate(sla.dueAt, { time: true })}`)
    : ticket.firstResponseAt ? `First replied ${timeAgo(ticket.firstResponseAt)}` : '—';

  return (
    <div className="page wide">
      <p className="crumbs"><Link to="/admin"><ArrowLeft size={15} />Ticket queue</Link></p>
      <div className="ticket-head">
        <div>
          <p className="mono muted">{ticket.ticketNumber} · opened {formatDate(ticket.createdAt, { time: true })}</p>
          <h1>{ticket.subject}</h1>
          <p className="muted ticket-sub"><span><User size={14} />{author.name}</span><span><BookOpen size={14} />{ticket.book ? ticket.book.title : 'General / Account Level'}</span></p>
        </div>
        <div className="head-badges"><PriorityBadge priority={ticket.priority} /><CategoryBadge category={ticket.category} /><StatusBadge status={ticket.status} /></div>
      </div>

      {ticket.aiStatus === 'fallback' && (
        <Alert kind="warn">The AI was unavailable when this ticket arrived, so category and priority were set by keyword rules. Please review them in the panel on the right.</Alert>
      )}

      <div className="workspace">
        <div className="ws-main">
          <Card title="Conversation">
            <Conversation ticket={ticket} messages={messages} attachments={attachments} viewerRole="admin" authorName={author.name} />
          </Card>

          {closed ? (
            <Alert kind="info">This ticket is closed. <button className="link" onClick={() => patch({ status: 'Open' }, 'Ticket reopened.')}>Reopen it</button> to reply.</Alert>
          ) : (
            <ReplyComposer ticketId={id} messages={messages} aiStatus={aiStatus.data} onSent={(updated) => (updated ? setData(updated) : refresh())} />
          )}

          <InternalNotes ticketId={id} notes={notes ?? []} onChanged={refresh} />
        </div>

        <aside className="ws-side">
          <Card title="Ticket & actions">
            <label className="side-label" htmlFor="status">Status</label>
            <select id="status" value={ticket.status} onChange={(e) => patch({ status: e.target.value }, 'Status updated.')}>
              {meta?.statuses.map((s) => <option key={s}>{s}</option>)}
            </select>

            <span className="side-label">Assigned to</span>
            <div className="assign">
              <strong>{ticket.assignedTo ? clean(ticket.assignedTo.name) : 'Unassigned'}</strong>
              {ticket.assignedTo?.id !== user.id && <button className="btn btn-sm" onClick={() => patch({ assignedTo: 'me' }, 'Assigned to you.')}>Assign to me</button>}
              {ticket.assignedTo && <button className="btn btn-sm btn-ghost" onClick={() => patch({ assignedTo: null }, 'Unassigned.')}>Unassign</button>}
            </div>
            {(admins.data?.items.length ?? 0) > 1 && (
              <select aria-label="Assign to another admin" value="" onChange={(e) => e.target.value && patch({ assignedTo: Number(e.target.value) }, 'Reassigned.')}>
                <option value="">Reassign to…</option>
                {admins.data.items.filter((a) => a.id !== ticket.assignedTo?.id).map((a) => <option key={a.id} value={a.id}>{clean(a.name)}</option>)}
              </select>
            )}

            <div className={`sla ${sla.overdue ? 'is-overdue' : ''}`}><Clock size={15} /><span>{slaText}</span></div>
          </Card>

          <Card title="AI classification" icon={Sparkles} actions={<button className="btn btn-sm btn-ghost" onClick={() => setConfirmRerun(true)} data-tip="Run the AI classifier again"><RefreshCw size={14} />Re-run</button>}>
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
              <p className="rationale small">
                <strong>Why:</strong> {ticket.aiRationale}
                {ticket.aiConfidence != null && ticket.categorySource === 'ai' && <span className="muted"> · confidence {Math.round(ticket.aiConfidence * 100)}%</span>}
              </p>
            )}
          </Card>

          <Card title="Author" icon={User}>
            <p><strong>{author.name}</strong><br /><a href={`mailto:${author.email}`}>{author.email}</a></p>
            <p className="muted small">{author.city} · {author.phone} · joined {formatDate(author.joinedDate)}</p>
            <span className="side-label">Books on this account</span>
            <ul className="mini-books">
              {books.map((b) => (
                <li key={b.bookId} className={selectedBook?.bookId === b.bookId ? 'selected' : ''}>
                  <span className="row"><strong>{b.title}</strong>{selectedBook?.bookId === b.bookId && <span className="badge badge-ai plain">This ticket</span>}</span>
                  <span className="muted xs">{b.status}</span>
                  {b.isPublished
                    ? <span className="xs">{b.totalCopiesSold} sold · earned {inr(b.totalRoyaltyEarned)} · paid {inr(b.royaltyPaid)} · <strong>pending {inr(b.royaltyPending)}</strong></span>
                    : <span className="xs muted">Not published yet</span>}
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
                  <div className="muted xs">{a.actorName} · {timeAgo(a.createdAt)}</div>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      <ConfirmModal open={confirmRerun} title="Re-run AI classification?" confirmLabel="Re-run" onConfirm={rerunAi} onCancel={() => setConfirmRerun(false)}>
        <p>This replaces any category or priority you set manually.</p>
      </ConfirmModal>
    </div>
  );
}
