import { config } from '../config/index.js';
import { OPEN_STATUSES } from '../config/constants.js';

const nowIso = () => new Date().toISOString();
const ticketNumber = (id) => `BL-${String(id).padStart(5, '0')}`;

const BASE_SELECT = `
  SELECT t.*,
    a.name  AS author_name,  a.email AS author_email,
    b.title AS book_title,
    u.name  AS assignee_name,
    (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
    (SELECT MAX(m.created_at) FROM ticket_messages m WHERE m.ticket_id = t.id) AS last_message_at,
    (SELECT m.sender_role FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_sender_role
  FROM tickets t
  JOIN authors a ON a.author_id = t.author_id
  LEFT JOIN books b ON b.book_id = t.book_id
  LEFT JOIN users u ON u.id = t.assigned_to`;

/** First-response SLA: only meaningful while a ticket is open and nobody has replied yet. */
export function slaInfo(row, now = Date.now()) {
  const targetHours = config.sla[row.priority ?? 'Medium'] ?? config.sla.Medium;
  const dueAt = new Date(new Date(row.created_at).getTime() + targetHours * 3_600_000);
  const waiting = OPEN_STATUSES.includes(row.status) && !row.first_response_at;
  return { targetHours, dueAt: dueAt.toISOString(), waitingForFirstResponse: waiting, overdue: waiting && dueAt.getTime() < now };
}

/** DB row -> full (admin) ticket DTO. */
export function toAdminTicket(row, now = Date.now()) {
  if (!row) return null;
  return {
    id: row.id,
    ticketNumber: ticketNumber(row.id),
    subject: row.subject,
    description: row.description,
    status: row.status,
    category: row.category,
    categorySource: row.category_source,
    priority: row.priority,
    prioritySource: row.priority_source,
    aiStatus: row.ai_status,
    aiConfidence: row.ai_confidence,
    aiRationale: row.ai_rationale,
    author: { authorId: row.author_id, name: row.author_name, email: row.author_email },
    book: row.book_id ? { bookId: row.book_id, title: row.book_title } : null,
    assignedTo: row.assigned_to ? { id: row.assigned_to, name: row.assignee_name } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    firstResponseAt: row.first_response_at,
    resolvedAt: row.resolved_at,
    messageCount: row.message_count ?? 0,
    lastMessageAt: row.last_message_at ?? null,
    lastSenderRole: row.last_sender_role ?? null,
    ageHours: Math.max(0, Math.round((now - new Date(row.created_at).getTime()) / 3_600_000)),
    sla: slaInfo(row, now),
  };
}

/** Author-facing view: no triage metadata, no assignee, no SLA - only what an author needs. */
export function toAuthorTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketNumber: ticketNumber(row.id),
    subject: row.subject,
    description: row.description,
    status: row.status,
    book: row.book_id ? { bookId: row.book_id, title: row.book_title } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    messageCount: row.message_count ?? 0,
    lastMessageAt: row.last_message_at ?? null,
    lastSenderRole: row.last_sender_role ?? null,
    awaitingYourReply: row.last_sender_role === 'admin' && OPEN_STATUSES.includes(row.status),
  };
}

const toMessage = (m, users) => ({
  id: m.id,
  senderRole: m.sender_role,
  senderName: users.get(m.sender_id) ?? (m.sender_role === 'admin' ? 'BookLeaf Support' : 'Author'),
  body: m.body,
  aiAssisted: Boolean(m.ai_assisted),
  createdAt: m.created_at,
});

export function createTicketRepo(db) {
  const userNames = () => new Map(db.prepare('SELECT id, name FROM users').all().map((u) => [u.id, u.name]));

  const urgencyOrder = `
    (t.status IN ('Resolved', 'Closed')) ASC,
    CASE t.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 2 END ASC,
    t.created_at ASC`;
  const SORTS = {
    urgency: urgencyOrder,
    oldest: 't.created_at ASC',
    newest: 't.created_at DESC',
    updated: 't.updated_at DESC',
  };

  return {
    create({ authorId, bookId, subject, description }) {
      const ts = nowIso();
      const { lastInsertRowid } = db.prepare(`INSERT INTO tickets (author_id, book_id, subject, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(authorId, bookId ?? null, subject, description, ts, ts);
      return Number(lastInsertRowid);
    },

    findRow: (id) => db.prepare(`${BASE_SELECT} WHERE t.id = ?`).get(id),

    /**
     * List tickets. `authorId` scopes to one author (author portal); omit for the admin queue.
     * Filter values are always bound parameters - never interpolated into SQL.
     */
    list({ authorId, status, category, priority, assignee, q, from, to, sort = 'urgency', page = 1, pageSize = 25, adminId } = {}) {
      const where = [];
      const params = {};
      if (authorId) { where.push('t.author_id = @authorId'); params.authorId = authorId; }
      if (status?.length) {
        where.push(`t.status IN (${status.map((_, i) => `@status${i}`).join(',')})`);
        status.forEach((s, i) => { params[`status${i}`] = s; });
      }
      if (category) { where.push('t.category = @category'); params.category = category; }
      if (priority) { where.push('t.priority = @priority'); params.priority = priority; }
      if (assignee === 'unassigned') where.push('t.assigned_to IS NULL');
      else if (assignee === 'me' && adminId) { where.push('t.assigned_to = @adminId'); params.adminId = adminId; }
      else if (Number.isInteger(Number(assignee)) && assignee) { where.push('t.assigned_to = @assigneeId'); params.assigneeId = Number(assignee); }
      if (from) { where.push('t.created_at >= @from'); params.from = from; }
      if (to) { where.push('t.created_at < @to'); params.to = to; }
      if (q) {
        where.push(`(t.subject LIKE @q ESCAPE '\\' OR t.description LIKE @q ESCAPE '\\' OR a.name LIKE @q ESCAPE '\\'
          OR ('BL-' || printf('%05d', t.id)) LIKE @q ESCAPE '\\' OR b.title LIKE @q ESCAPE '\\')`);
        params.q = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const orderSql = SORTS[sort] ?? SORTS.urgency;

      const total = db.prepare(`SELECT COUNT(*) AS n FROM tickets t
        JOIN authors a ON a.author_id = t.author_id LEFT JOIN books b ON b.book_id = t.book_id ${whereSql}`).get(params).n;
      const rows = db.prepare(`${BASE_SELECT} ${whereSql} ORDER BY ${orderSql} LIMIT @limit OFFSET @offset`)
        .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });
      return { rows, total };
    },

    /** Generic column update; `patch` keys must be whitelisted by the caller (service layer). */
    update(id, patch) {
      const cols = Object.keys(patch);
      if (!cols.length) return;
      const set = [...cols.map((c) => `${c} = @${c}`), 'updated_at = @updated_at'].join(', ');
      db.prepare(`UPDATE tickets SET ${set} WHERE id = @id`).run({ ...patch, updated_at: nowIso(), id });
    },

    /**
     * Apply AI/rules triage output - but never overwrite a value an admin already set by hand
     * (an admin override can land while a slow AI call is still in flight).
     */
    applyTriage(id, { category, priority, confidence, rationale, source, aiStatus }) {
      db.prepare(`UPDATE tickets SET
        category        = CASE WHEN category_source = 'admin' THEN category ELSE @category END,
        category_source = CASE WHEN category_source = 'admin' THEN 'admin' ELSE @source END,
        priority        = CASE WHEN priority_source = 'admin' THEN priority ELSE @priority END,
        priority_source = CASE WHEN priority_source = 'admin' THEN 'admin' ELSE @source END,
        ai_confidence = @confidence, ai_rationale = @rationale, ai_status = @aiStatus, updated_at = @updated_at
        WHERE id = @id`).run({ id, category, priority, confidence: confidence ?? null, rationale: rationale ?? null, source, aiStatus, updated_at: nowIso() });
    },

    // ---- conversation -------------------------------------------------------------------
    addMessage({ ticketId, senderRole, senderId, body, aiAssisted = false }) {
      const ts = nowIso();
      const { lastInsertRowid } = db.prepare(`INSERT INTO ticket_messages (ticket_id, sender_role, sender_id, body, ai_assisted, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(ticketId, senderRole, senderId, body, aiAssisted ? 1 : 0, ts);
      return Number(lastInsertRowid);
    },
    messageRows: (ticketId) => db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY id').all(ticketId),
    listMessages(ticketId) {
      const names = userNames();
      return db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY id').all(ticketId).map((m) => toMessage(m, names));
    },

    // ---- internal notes (admin only) -----------------------------------------------------
    addNote: ({ ticketId, adminId, body }) => Number(db.prepare('INSERT INTO ticket_notes (ticket_id, admin_id, body, created_at) VALUES (?, ?, ?, ?)')
      .run(ticketId, adminId, body, nowIso()).lastInsertRowid),
    listNotes(ticketId) {
      const names = userNames();
      return db.prepare('SELECT * FROM ticket_notes WHERE ticket_id = ? ORDER BY id DESC').all(ticketId)
        .map((n) => ({ id: n.id, body: n.body, authorName: names.get(n.admin_id) ?? 'Admin', adminId: n.admin_id, createdAt: n.created_at }));
    },

    // ---- audit trail ---------------------------------------------------------------------
    addActivity: ({ ticketId, actorId = null, action, detail = null }) =>
      db.prepare('INSERT INTO ticket_activity (ticket_id, actor_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(ticketId, actorId, action, detail, nowIso()),
    listActivity(ticketId) {
      const names = userNames();
      return db.prepare('SELECT * FROM ticket_activity WHERE ticket_id = ? ORDER BY id DESC').all(ticketId)
        .map((a) => ({ id: a.id, action: a.action, detail: a.detail, actorName: a.actor_id ? names.get(a.actor_id) : 'System', createdAt: a.created_at }));
    },

    // ---- attachments ---------------------------------------------------------------------
    addAttachment: ({ ticketId, originalName, storedName, mimeType, sizeBytes }) =>
      db.prepare('INSERT INTO ticket_attachments (ticket_id, original_name, stored_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(ticketId, originalName, storedName, mimeType, sizeBytes, nowIso()),
    listAttachments: (ticketId) => db.prepare('SELECT * FROM ticket_attachments WHERE ticket_id = ? ORDER BY id').all(ticketId)
      .map((a) => ({ id: a.id, fileName: a.original_name, mimeType: a.mime_type, sizeBytes: a.size_bytes, createdAt: a.created_at })),
    findAttachment: (ticketId, attachmentId) => db.prepare('SELECT * FROM ticket_attachments WHERE ticket_id = ? AND id = ?').get(ticketId, attachmentId),

    // ---- dashboard stats -----------------------------------------------------------------
    stats(now = Date.now()) {
      const count = (sql, ...p) => db.prepare(sql).get(...p).n;
      const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
      const open = `status IN ('Open','In Progress')`;
      const groups = (col) => Object.fromEntries(db.prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM tickets WHERE ${open} GROUP BY ${col}`).all().map((r) => [r.k ?? 'Pending', r.n]));
      const waiting = db.prepare(`SELECT priority, created_at, status, first_response_at FROM tickets WHERE ${open} AND first_response_at IS NULL`).all();
      const avg = db.prepare(`SELECT AVG((julianday(first_response_at) - julianday(created_at)) * 24) AS h FROM tickets WHERE first_response_at IS NOT NULL`).get().h;
      return {
        byStatus: Object.fromEntries(db.prepare('SELECT status AS k, COUNT(*) AS n FROM tickets GROUP BY status').all().map((r) => [r.k, r.n])),
        openByPriority: groups('priority'),
        openByCategory: groups('category'),
        totalOpen: count(`SELECT COUNT(*) AS n FROM tickets WHERE ${open}`),
        unassignedOpen: count(`SELECT COUNT(*) AS n FROM tickets WHERE ${open} AND assigned_to IS NULL`),
        overdue: waiting.filter((r) => slaInfo(r, now).overdue).length,
        awaitingFirstResponse: waiting.length,
        createdLast7Days: count('SELECT COUNT(*) AS n FROM tickets WHERE created_at >= ?', weekAgo),
        resolvedLast7Days: count('SELECT COUNT(*) AS n FROM tickets WHERE resolved_at >= ?', weekAgo),
        avgFirstResponseHours: avg == null ? null : Number(avg.toFixed(1)),
        needsTriageReview: count(`SELECT COUNT(*) AS n FROM tickets WHERE ${open} AND (category_source = 'rules' OR ai_status = 'failed')`),
      };
    },
  };
}
