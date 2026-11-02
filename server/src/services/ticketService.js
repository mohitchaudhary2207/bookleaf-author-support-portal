import { toAdminTicket, toAuthorTicket } from '../repositories/tickets.js';
import { toBookFacts } from '../repositories/books.js';
import { draftInputHash } from './ai/aiService.js';
import { conflict, notFound, validationError } from '../utils/errors.js';

const AI_REASON_TEXT = {
  disabled: 'the AI assistant is not configured',
  rate_limited: 'the AI provider is rate-limiting requests right now',
  quota: 'the AI account has run out of quota (check billing)',
  timeout: 'the AI provider timed out',
  unavailable: 'the AI provider is unreachable',
  auth: 'the AI provider rejected the API key',
  refused: 'the AI declined this request',
  invalid_response: 'the AI returned an unusable answer',
};

/** "Riya Mehta (Support Lead)" -> "Riya Mehta": the name an author should see in the sign-off. */
const signatureName = (name) => name.replace(/\s*\(.*\)\s*$/, '').trim();

/**
 * Ticket business logic: lifecycle rules, permissions on individual tickets, AI triage and
 * draft orchestration, audit trail and real-time notifications. Routes stay thin (parse ->
 * call service -> respond) and repositories stay dumb (SQL only).
 */
export function createTicketService({ db, repos, ai, events, logger }) {
  const { tickets, books, aiRepo } = repos;
  const inFlightDrafts = new Map(); // ticketId -> Promise: de-duplicates concurrent draft generation
  const background = new Set();     // pending fire-and-forget jobs (lets tests await completion)

  const track = (promise) => {
    background.add(promise);
    promise.finally(() => background.delete(promise));
    return promise;
  };

  // ---------------------------------------------------------------------------------------
  // Loading + access control
  // ---------------------------------------------------------------------------------------

  /** Load a ticket the caller may see. Authors get 404 (not 403) for other people's tickets so
   *  ticket ids cannot be probed. */
  function loadAccessible(user, id) {
    const row = tickets.findRow(id);
    if (!row) throw notFound('Ticket not found');
    if (user.role === 'author' && row.author_id !== user.authorId) throw notFound('Ticket not found');
    return row;
  }

  const activity = (ticketId, actor, action, detail) => tickets.addActivity({ ticketId, actorId: actor?.id ?? null, action, detail });
  const emit = (type, row, opts) => events.publish(type, { ticketId: row.id, authorId: row.author_id }, opts);

  // ---------------------------------------------------------------------------------------
  // Author operations
  // ---------------------------------------------------------------------------------------

  function createTicket(user, { bookId, subject, description }, files = []) {
    if (bookId) {
      const book = books.findRow(bookId);
      if (!book || book.author_id !== user.authorId) {
        throw validationError([{ path: 'bookId', message: 'Select one of your own books, or General / Account Level' }]);
      }
    }
    const id = db.transaction(() => {
      const ticketId = tickets.create({ authorId: user.authorId, bookId, subject, description });
      for (const f of files) tickets.addAttachment({ ticketId, originalName: f.originalname, storedName: f.filename, mimeType: f.mimetype, sizeBytes: f.size });
      activity(ticketId, user, 'created', files.length ? `${files.length} attachment(s)` : null);
      return ticketId;
    })();

    const row = tickets.findRow(id);
    emit('ticket.created', row);
    // Triage runs AFTER the response: ticket creation never waits for (or fails because of) the AI.
    track(runTriage(id).catch((err) => logger.error('triage job crashed', err)));
    return toAuthorTicket(row);
  }

  function listForAuthor(user, filters) {
    const { rows, total } = tickets.list({ ...filters, authorId: user.authorId, sort: 'updated' });
    return { items: rows.map(toAuthorTicket), total };
  }

  function getForAuthor(user, id) {
    const row = loadAccessible(user, id);
    return { ticket: toAuthorTicket(row), messages: tickets.listMessages(id), attachments: tickets.listAttachments(id) };
  }

  function authorReply(user, id, body) {
    const row = loadAccessible(user, id);
    if (row.status === 'Closed') throw conflict('This ticket is closed. Please open a new ticket for further help.');
    db.transaction(() => {
      tickets.addMessage({ ticketId: id, senderRole: 'author', senderId: user.id, body });
      // A follow-up on a resolved ticket reopens it so it reappears in the support queue.
      if (row.status === 'Resolved') {
        tickets.update(id, { status: 'Open', resolved_at: null });
        activity(id, user, 'reopened', 'Author replied after resolution');
      } else tickets.update(id, {});
    })();
    emit('ticket.message', row);
    return getForAuthor(user, id);
  }

  function authorClose(user, id) {
    const row = loadAccessible(user, id);
    if (row.status === 'Closed') return getForAuthor(user, id);
    tickets.update(id, { status: 'Closed', resolved_at: row.resolved_at ?? new Date().toISOString() });
    activity(id, user, 'status_changed', `${row.status} -> Closed (by author)`);
    emit('ticket.updated', row);
    return getForAuthor(user, id);
  }

  // ---------------------------------------------------------------------------------------
  // AI triage
  // ---------------------------------------------------------------------------------------

  async function runTriage(id, actor = null) {
    const row = tickets.findRow(id);
    if (!row) return null;
    const bookRow = row.book_id ? toBookFacts(books.findRow(row.book_id)) : null;
    const result = await ai.triage({ ticketId: id, subject: row.subject, description: row.description, book: bookRow });
    tickets.applyTriage(id, {
      category: result.category,
      priority: result.priority,
      confidence: result.confidence,
      rationale: result.rationale,
      source: result.source,
      aiStatus: result.degraded ? 'fallback' : 'done',
    });
    aiRepo.deleteDraft(id); // category may have changed -> any cached draft is stale
    activity(id, actor, result.degraded ? 'triaged_by_rules' : 'triaged_by_ai',
      `${result.category} / ${result.priority}${result.degraded ? ` (AI unavailable: ${result.reason})` : ''}`);
    emit('ticket.triaged', row, { adminOnly: true });
    return tickets.findRow(id);
  }

  // ---------------------------------------------------------------------------------------
  // Admin operations
  // ---------------------------------------------------------------------------------------

  function listForAdmin(admin, filters) {
    const { rows, total } = tickets.list({ ...filters, adminId: admin.id });
    const now = Date.now();
    return { items: rows.map((r) => toAdminTicket(r, now)), total };
  }

  function getForAdmin(admin, id) {
    const row = loadAccessible(admin, id);
    const author = books.findAuthor(row.author_id);
    const authorBooks = books.listByAuthor(row.author_id);
    return {
      ticket: toAdminTicket(row),
      messages: tickets.listMessages(id),
      notes: tickets.listNotes(id),
      activity: tickets.listActivity(id),
      attachments: tickets.listAttachments(id),
      author: { authorId: author.author_id, name: author.name, email: author.email, phone: author.phone, city: author.city, joinedDate: author.joined_date },
      books: authorBooks,
      selectedBook: row.book_id ? authorBooks.find((b) => b.bookId === row.book_id) ?? null : null,
    };
  }

  /** Admin edits: status, category/priority overrides, assignment. Every change is audited. */
  function updateTicket(admin, id, patch, allAdmins) {
    const row = loadAccessible(admin, id);
    const columns = {};
    const log = [];

    if (patch.status && patch.status !== row.status) {
      columns.status = patch.status;
      const closing = ['Resolved', 'Closed'].includes(patch.status);
      columns.resolved_at = closing ? (row.resolved_at ?? new Date().toISOString()) : null;
      log.push(['status_changed', `${row.status} -> ${patch.status}`]);
    }
    if (patch.category && patch.category !== row.category) {
      columns.category = patch.category;
      columns.category_source = 'admin';
      log.push(['category_overridden', `${row.category ?? 'unclassified'} -> ${patch.category} (was ${row.category_source})`]);
    }
    if (patch.priority && patch.priority !== row.priority) {
      columns.priority = patch.priority;
      columns.priority_source = 'admin';
      log.push(['priority_overridden', `${row.priority ?? 'unscored'} -> ${patch.priority} (was ${row.priority_source})`]);
    }
    if ('assignedTo' in patch) {
      const target = patch.assignedTo === 'me' ? admin.id : patch.assignedTo;
      if (target !== null && !allAdmins.some((a) => a.id === target)) {
        throw validationError([{ path: 'assignedTo', message: 'Assignee must be an admin user' }]);
      }
      if (target !== row.assigned_to) {
        columns.assigned_to = target;
        const name = target ? allAdmins.find((a) => a.id === target).name : null;
        log.push([target ? 'assigned' : 'unassigned', name ?? `was ${row.assignee_name}`]);
      }
    }

    if (Object.keys(columns).length) {
      db.transaction(() => {
        tickets.update(id, columns);
        for (const [action, detail] of log) activity(id, admin, action, detail);
        // Category changed by a human -> the cached draft was written for the wrong policy.
        if (columns.category) aiRepo.deleteDraft(id);
      })();
      emit('ticket.updated', row);
    }
    return getForAdmin(admin, id);
  }

  function adminReply(admin, id, { body, aiAssisted = false, setStatus }) {
    const row = loadAccessible(admin, id);
    if (row.status === 'Closed') throw conflict('This ticket is closed. Reopen it before replying.');
    const columns = {};
    const log = [];
    const nextStatus = setStatus ?? (row.status === 'Open' ? 'In Progress' : row.status);

    db.transaction(() => {
      tickets.addMessage({ ticketId: id, senderRole: 'admin', senderId: admin.id, body, aiAssisted });
      if (!row.first_response_at) columns.first_response_at = new Date().toISOString();
      if (!row.assigned_to) { columns.assigned_to = admin.id; log.push(['assigned', `${admin.name} (auto, on first reply)`]); }
      if (nextStatus !== row.status) {
        columns.status = nextStatus;
        columns.resolved_at = ['Resolved', 'Closed'].includes(nextStatus) ? new Date().toISOString() : null;
        log.push(['status_changed', `${row.status} -> ${nextStatus}`]);
      }
      tickets.update(id, columns);
      activity(id, admin, 'replied', aiAssisted ? 'Reply started from AI draft' : 'Manual reply');
      for (const [action, detail] of log) activity(id, admin, action, detail);
    })();
    emit('ticket.message', row);
    return getForAdmin(admin, id);
  }

  function addNote(admin, id, body) {
    const row = loadAccessible(admin, id);
    tickets.addNote({ ticketId: id, adminId: admin.id, body });
    tickets.update(id, {});
    activity(id, admin, 'note_added');
    emit('ticket.note', row, { adminOnly: true });
    return tickets.listNotes(id);
  }

  async function reclassify(admin, id) {
    loadAccessible(admin, id);
    // An explicit "re-run AI" is the one case where we deliberately replace earlier admin overrides.
    tickets.update(id, { category_source: 'pending', priority_source: 'pending' });
    await runTriage(id, admin);
    return getForAdmin(admin, id);
  }

  // ---------------------------------------------------------------------------------------
  // AI draft (lazy, cached, de-duplicated)
  // ---------------------------------------------------------------------------------------

  function draftDto(record, { cached }) {
    return {
      body: record.body,
      source: record.source,
      model: record.model,
      notes: JSON.parse(record.notes || '[]'),
      generatedAt: record.generated_at,
      cached,
      aiAvailable: ai.status().available,
      aiStatus: ai.status().reason,
    };
  }

  async function getDraft(admin, id, { regenerate = false } = {}) {
    const row = loadAccessible(admin, id);
    if (row.status === 'Closed') throw conflict('Closed tickets cannot receive replies');

    const bookRow = row.book_id ? books.findRow(row.book_id) : null;
    const thread = tickets.messageRows(id);
    const hash = draftInputHash({ ticket: row, thread, book: bookRow });
    const cached = aiRepo.getDraft(id);

    // Reuse a cached draft unless: the conversation/ticket changed, the admin asked for a fresh one,
    // or the cache holds a template made during an outage and the AI has since recovered.
    const staleTemplate = cached?.source === 'template' && ai.status().available;
    if (cached && cached.input_hash === hash && !regenerate && !staleTemplate) return draftDto(cached, { cached: true });

    if (inFlightDrafts.has(id)) return inFlightDrafts.get(id);

    const job = (async () => {
      const author = books.findAuthor(row.author_id);
      const result = await ai.draft({
        ticket: { ...row, ticket_number: `BL-${String(row.id).padStart(5, '0')}`, category: row.category ?? 'General Inquiry', priority: row.priority ?? 'Medium' },
        author,
        book: toBookFacts(bookRow),
        books: books.listRowsByAuthor(row.author_id).map(toBookFacts),
        thread,
        responderName: signatureName(admin.name),
      });
      const notes = [...result.admin_notes];
      if (result.degraded) notes.unshift(`AI draft unavailable - ${AI_REASON_TEXT[result.reason] ?? result.reason}. Showing a template draft built from BookLeaf policy; review it carefully.`);
      aiRepo.saveDraft({ ticketId: id, body: result.reply, source: result.source, model: result.model, inputHash: hash, notes });
      activity(id, admin, result.degraded ? 'draft_template' : 'draft_generated', result.model ?? undefined);
      return draftDto(aiRepo.getDraft(id), { cached: false });
    })().finally(() => inFlightDrafts.delete(id));

    inFlightDrafts.set(id, job);
    return job;
  }

  return {
    // author
    createTicket, listForAuthor, getForAuthor, authorReply, authorClose,
    // admin
    listForAdmin, getForAdmin, updateTicket, adminReply, addNote, reclassify, getDraft,
    // internals exposed for tests / bootstrapping
    runTriage,
    whenIdle: () => Promise.allSettled([...background]),
  };
}
