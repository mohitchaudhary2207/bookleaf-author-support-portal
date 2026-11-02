import { useEffect, useRef } from 'react';
import { formatBytes, formatDate, timeAgo } from '../utils/format.js';

/** Download links for ticket attachments (served by an authenticated endpoint). */
export function AttachmentList({ ticketId, attachments }) {
  if (!attachments?.length) return null;
  return (
    <ul className="attachments">
      {attachments.map((a) => (
        <li key={a.id}>
          <a href={`/api/v1/tickets/${ticketId}/attachments/${a.id}`} download>📎 {a.fileName}</a>
          <span className="muted small"> {formatBytes(a.sizeBytes)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The thread: the author's original query followed by every public message. `viewerRole`
 * decides which side is "me" so the same component serves both portals.
 */
export default function Conversation({ ticket, messages, attachments, viewerRole, authorName }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages.length]);

  const bubble = (key, { mine, who, when, body, extra, aiAssisted }) => (
    <div key={key} className={`bubble-row ${mine ? 'mine' : 'theirs'}`}>
      <div className="bubble">
        <div className="bubble-meta">
          <strong>{who}</strong>
          <span className="muted" title={formatDate(when, { time: true })}>{timeAgo(when)}</span>
          {aiAssisted && viewerRole === 'admin' && <span className="source source-ai" title="Started from an AI draft">AI-assisted</span>}
        </div>
        <p className="bubble-body">{body}</p>
        {extra}
      </div>
    </div>
  );

  return (
    <div className="thread" aria-live="polite">
      {bubble('original', {
        mine: viewerRole === 'author',
        who: viewerRole === 'author' ? 'You' : authorName,
        when: ticket.createdAt,
        body: ticket.description,
        extra: <AttachmentList ticketId={ticket.id} attachments={attachments} />,
      })}
      {messages.map((m) => bubble(m.id, {
        mine: m.senderRole === viewerRole,
        who: m.senderRole === 'author' ? (viewerRole === 'author' ? 'You' : authorName) : (viewerRole === 'author' ? `${m.senderName.replace(/\s*\(.*\)$/, '')} · BookLeaf Support` : m.senderName.replace(/\s*\(.*\)$/, '')),
        when: m.createdAt,
        body: m.body,
        aiAssisted: m.aiAssisted,
      }))}
      <div ref={endRef} />
    </div>
  );
}
