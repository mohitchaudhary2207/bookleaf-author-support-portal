import { useEffect, useRef } from 'react';
import { Paperclip, Sparkles } from 'lucide-react';
import { formatBytes, formatDate, timeAgo } from '../utils/format.js';

/** Download links for ticket attachments (served by an authenticated endpoint). */
export function AttachmentList({ ticketId, attachments }) {
  if (!attachments?.length) return null;
  return (
    <ul className="attachments">
      {attachments.map((a) => (
        <li key={a.id}>
          <a href={`/api/v1/tickets/${ticketId}/attachments/${a.id}`} download><Paperclip size={14} />{a.fileName}</a>
          <span className="muted xs"> {formatBytes(a.sizeBytes)}</span>
        </li>
      ))}
    </ul>
  );
}

const clean = (name = '') => name.replace(/\s*\(.*\)$/, '');
const initials = (name = '') => clean(name).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/**
 * The thread: the author's original query followed by every public message. `viewerRole`
 * decides which side is "me" so the same component serves both portals. Author and BookLeaf
 * messages are visually distinct (role label + side + colour), never colour alone.
 */
export default function Conversation({ ticket, messages, attachments, viewerRole, authorName }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages.length]);

  const bubble = (key, { role, mine, who, when, body, extra, aiAssisted }) => (
    <div key={key} className={`bubble-row ${mine ? 'mine' : 'theirs'} from-${role}`}>
      <span className={`avatar avatar-sm ${role === 'admin' ? 'avatar-team' : ''}`} aria-hidden>{who === 'You' ? 'YOU' : initials(who)}</span>
      <div className="bubble">
        <div className="bubble-meta">
          <strong>{who}</strong>
          <span className={`role-tag role-${role}`}>{role === 'admin' ? 'BookLeaf Support' : 'Author'}</span>
          <span className="muted xs" title={formatDate(when, { time: true })}>{timeAgo(when)}</span>
          {aiAssisted && viewerRole === 'admin' && <span className="source source-ai" title="Started from an AI draft"><Sparkles size={10} /> AI-assisted</span>}
        </div>
        <p className="bubble-body">{body}</p>
        {extra}
      </div>
    </div>
  );

  return (
    <div className="thread" aria-live="polite">
      {bubble('original', {
        role: 'author',
        mine: viewerRole === 'author',
        who: viewerRole === 'author' ? 'You' : authorName,
        when: ticket.createdAt,
        body: ticket.description,
        extra: <AttachmentList ticketId={ticket.id} attachments={attachments} />,
      })}
      {messages.map((m) => bubble(m.id, {
        role: m.senderRole,
        mine: m.senderRole === viewerRole,
        who: m.senderRole === 'author' ? (viewerRole === 'author' ? 'You' : authorName) : clean(m.senderName),
        when: m.createdAt,
        body: m.body,
        aiAssisted: m.aiAssisted,
      }))}
      <div ref={endRef} />
    </div>
  );
}
