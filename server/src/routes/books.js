import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { bookSchemas } from '../schemas/index.js';
import { notFound } from '../utils/errors.js';

/** Totals shown at the top of the "My Books" page. */
function summarize(items) {
  const published = items.filter((b) => b.isPublished);
  const sum = (key) => published.reduce((acc, b) => acc + (b[key] ?? 0), 0);
  return {
    totalBooks: items.length,
    published: published.length,
    inProduction: items.length - published.length,
    totalCopiesSold: sum('totalCopiesSold'),
    totalRoyaltyEarned: sum('totalRoyaltyEarned'),
    totalRoyaltyPaid: sum('royaltyPaid'),
    totalRoyaltyPending: sum('royaltyPending'),
  };
}

export function bookRoutes({ repos }) {
  const router = Router();

  // Authors always get their own books (any ?authorId is ignored). Admins pick an author.
  router.get('/', validate(bookSchemas.list), (req, res) => {
    const authorId = req.user.role === 'author' ? req.user.authorId : req.valid.query.authorId;
    if (!authorId) return res.json({ items: [], summary: summarize([]) });
    const items = repos.books.listByAuthor(authorId);
    res.json({ items, summary: summarize(items) });
  });

  router.get('/:bookId', validate(bookSchemas.one), (req, res) => {
    const book = repos.books.findById(req.valid.params.bookId);
    // 404 (not 403) for someone else's book, so ids cannot be probed.
    if (!book || (req.user.role === 'author' && book.authorId !== req.user.authorId)) throw notFound('Book not found');
    res.json(book);
  });

  return router;
}
