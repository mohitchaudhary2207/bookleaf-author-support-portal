import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export const ADMIN_ACCOUNTS = [
  { email: 'admin@bookleaf.com', name: 'Riya Mehta (Support Lead)' },
  { email: 'support@bookleaf.com', name: 'Aman Verma (Support)' },
];

const WIPE_ORDER = ['ai_usage', 'ai_drafts', 'ticket_activity', 'ticket_attachments', 'ticket_notes',
  'ticket_messages', 'tickets', 'books', 'users', 'authors'];

/**
 * Seeds authors, books, login accounts and a handful of realistic demo tickets from the
 * provided dataset. Idempotent: does nothing if users already exist, unless force=true
 * (which wipes everything first).
 */
export function seedDatabase(db, { force = false, withDemoTickets = true } = {}) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (existing > 0 && !force) return { seeded: false };

  const data = JSON.parse(fs.readFileSync(config.seedDataPath, 'utf8'));
  const authorHash = bcrypt.hashSync(config.seed.authorPassword, 10);
  const adminHash = bcrypt.hashSync(config.seed.adminPassword, 10);

  db.transaction(() => {
    if (force) for (const table of WIPE_ORDER) db.exec(`DELETE FROM ${table}`);

    const insAuthor = db.prepare(`INSERT INTO authors (author_id, name, email, phone, city, joined_date)
      VALUES (@author_id, @name, @email, @phone, @city, @joined_date)`);
    const insBook = db.prepare(`INSERT INTO books (book_id, author_id, title, isbn, genre, publication_date, status, mrp,
      author_royalty_per_copy, total_copies_sold, total_royalty_earned, royalty_paid, royalty_pending,
      last_royalty_payout_date, print_partner, available_on)
      VALUES (@book_id, @author_id, @title, @isbn, @genre, @publication_date, @status, @mrp,
      @author_royalty_per_copy, @total_copies_sold, @total_royalty_earned, @royalty_paid, @royalty_pending,
      @last_royalty_payout_date, @print_partner, @available_on)`);
    const insUser = db.prepare(`INSERT INTO users (email, password_hash, name, role, author_id) VALUES (?, ?, ?, ?, ?)`);

    for (const a of data.authors) {
      insAuthor.run({ author_id: a.author_id, name: a.name, email: a.email, phone: a.phone, city: a.city, joined_date: a.joined_date });
      insUser.run(a.email, authorHash, a.name, 'author', a.author_id);
      for (const b of a.books) {
        insBook.run({ ...b, author_id: a.author_id, available_on: JSON.stringify(b.available_on ?? []) });
      }
    }
    for (const admin of ADMIN_ACCOUNTS) insUser.run(admin.email, adminHash, admin.name, 'admin', null);
  })();

  if (withDemoTickets) seedDemoTickets(db);
  logger.info(`Seeded database: ${data.authors.length} authors, ${ADMIN_ACCOUNTS.length} admins`);
  return { seeded: true };
}

/**
 * A few pre-existing tickets so neither portal is empty on first look. Inserted directly
 * (no LLM call) with the triage fields filled as if the AI had already run.
 */
function seedDemoTickets(db) {
  const admin = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_ACCOUNTS[0].email);
  const ago = (days, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();

  const demo = [
    { author: 'AUTH003', book: 'BK005', subject: 'No royalty received since publishing', category: 'Royalty & Payments', priority: 'High', status: 'Open', created: ago(6),
      description: 'Hi team, my book Between Two Temples has been live since July 2024 and I have not received a single royalty payment yet. The dashboard shows some amount as pending. Can you tell me when I will be paid?' },
    { author: 'AUTH007', book: 'BK013', subject: 'When will my cover be ready?', category: 'Book Status & Production Updates', priority: 'Medium', status: 'In Progress', created: ago(3), assigned: admin.id,
      description: 'Midnight in Mysore has been in cover design for weeks. I approved the first concept long ago. Could you share an updated timeline?',
      reply: { body: 'Hi Sneha, thank you for checking in, and apologies for the wait. I am confirming with our design team where your cover currently stands and will come back to you with a firm date within 48 hours.\n\nWarm regards,\nRiya Mehta\nBookLeaf Support', hoursAfter: 20 } },
    { author: 'AUTH002', book: 'BK003', subject: 'Print quality of my latest author copies', category: 'Printing & Quality', priority: 'High', status: 'Open', created: ago(1, 4),
      description: 'I received 10 author copies of Code & Karma yesterday. Several pages have misaligned margins and the cover colours look washed out compared to the proof. Please advise.' },
    { author: 'AUTH008', book: 'BK014', subject: 'Can I update my author bio on Amazon?', category: 'General Inquiry', priority: 'Low', status: 'Resolved', created: ago(9), assigned: admin.id,
      description: 'I would like to change the author bio for Ghazal of the Forgotten now that the book is live. Is that possible?',
      reply: { body: 'Hi Farhan, absolutely - metadata updates such as your author bio can be submitted through your dashboard or by emailing our team. Changes typically show on the platforms within 3-5 business days. Let us know if you would like us to submit it for you.\n\nWarm regards,\nRiya Mehta\nBookLeaf Support', hoursAfter: 5 } },
    { author: 'AUTH005', book: 'BK009', subject: 'Book shows Currently Unavailable on Amazon US', category: 'Distribution & Availability', priority: 'High', status: 'Open', created: ago(0, 7),
      description: 'Letters from Lakshadweep is showing "Currently Unavailable" on Amazon US since this morning. It was fine last week.' },
  ];

  const insTicket = db.prepare(`INSERT INTO tickets (author_id, book_id, subject, description, status, category, category_source,
    priority, priority_source, ai_confidence, ai_rationale, ai_status, assigned_to, created_at, updated_at, first_response_at, resolved_at)
    VALUES (@author_id, @book_id, @subject, @description, @status, @category, 'ai', @priority, 'ai', 0.9,
    'Seeded demo ticket', 'done', @assigned_to, @created_at, @updated_at, @first_response_at, @resolved_at)`);
  const insMsg = db.prepare(`INSERT INTO ticket_messages (ticket_id, sender_role, sender_id, body, ai_assisted, created_at)
    VALUES (?, 'admin', ?, ?, 1, ?)`);

  db.transaction(() => {
    for (const t of demo) {
      const responseAt = t.reply ? new Date(new Date(t.created).getTime() + t.reply.hoursAfter * 3_600_000).toISOString() : null;
      const { lastInsertRowid: id } = insTicket.run({
        author_id: t.author, book_id: t.book, subject: t.subject, description: t.description, status: t.status,
        category: t.category, priority: t.priority, assigned_to: t.assigned ?? null,
        created_at: t.created, updated_at: responseAt ?? t.created, first_response_at: responseAt,
        resolved_at: t.status === 'Resolved' ? responseAt : null,
      });
      if (t.reply) insMsg.run(id, admin.id, t.reply.body, responseAt);
    }
  })();
}
