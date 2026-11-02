import { PRODUCTION_STAGES } from '../config/constants.js';

/** DB row -> API shape (camelCase), with derived fields the UI needs for edge cases. */
export function toBook(row) {
  if (!row) return null;
  const published = String(row.status).startsWith('Published');
  const stageName = PRODUCTION_STAGES.find((s) => String(row.status).includes(s));
  return {
    bookId: row.book_id,
    authorId: row.author_id,
    title: row.title,
    isbn: row.isbn,
    genre: row.genre,
    publicationDate: row.publication_date,
    status: row.status,
    isPublished: published,
    productionStage: published ? null : stageName ?? null,
    productionStageIndex: published ? PRODUCTION_STAGES.length - 1 : PRODUCTION_STAGES.indexOf(stageName),
    mrp: row.mrp,
    royaltyPerCopy: row.author_royalty_per_copy,
    totalCopiesSold: row.total_copies_sold,
    totalRoyaltyEarned: row.total_royalty_earned,
    royaltyPaid: row.royalty_paid,
    royaltyPending: row.royalty_pending,
    lastRoyaltyPayoutDate: row.last_royalty_payout_date,
    printPartner: row.print_partner,
    availableOn: JSON.parse(row.available_on || '[]'),
  };
}

/** Raw-ish shape used by the AI fact builders (snake_case + parsed availability). */
export function toBookFacts(row) {
  return row && { ...row, available_on: JSON.parse(row.available_on || '[]') };
}

export function createBookRepo(db) {
  return {
    listByAuthor: (authorId) => db.prepare('SELECT * FROM books WHERE author_id = ? ORDER BY publication_date IS NULL, publication_date DESC, book_id').all(authorId).map(toBook),
    findById: (bookId) => toBook(db.prepare('SELECT * FROM books WHERE book_id = ?').get(bookId)),
    findRow: (bookId) => db.prepare('SELECT * FROM books WHERE book_id = ?').get(bookId),
    listRowsByAuthor: (authorId) => db.prepare('SELECT * FROM books WHERE author_id = ? ORDER BY book_id').all(authorId),
    findAuthor: (authorId) => db.prepare('SELECT * FROM authors WHERE author_id = ?').get(authorId),
    listAuthors: () => db.prepare(`SELECT a.*, COUNT(b.book_id) AS book_count FROM authors a LEFT JOIN books b ON b.author_id = a.author_id GROUP BY a.author_id ORDER BY a.name`).all(),
  };
}
