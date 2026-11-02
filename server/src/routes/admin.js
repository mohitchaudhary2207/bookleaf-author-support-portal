import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { validate } from '../middleware/validate.js';
import { adminTicketSchemas as schemas } from '../schemas/index.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/errors.js';

/** Admin (operations team) endpoints. The whole router is mounted behind requireRole('admin'). */
export function adminRoutes({ tickets, repos, ai }) {
  const router = Router();

  // Every generation is a paid LLM call: cap them per admin (reading a saved draft is unaffected).
  const regenerateLimiter = rateLimit({
    windowMs: 60_000,
    limit: 12,
    keyGenerator: (req) => `admin:${req.user.id}`,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    skip: () => config.isTest,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'You are regenerating drafts very quickly. Please wait a minute.')),
  });

  // ---- ticket queue ------------------------------------------------------------------------
  router.get('/tickets', validate(schemas.list), (req, res) => {
    const { page, pageSize } = req.valid.query;
    const { items, total } = tickets.listForAdmin(req.user, req.valid.query);
    res.json({ items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) });
  });

  router.get('/tickets/:id', validate(schemas.one), (req, res) => {
    res.json(tickets.getForAdmin(req.user, req.valid.params.id));
  });

  // Status, category/priority overrides, assignment ("me" = assign to myself)
  router.patch('/tickets/:id', validate(schemas.update), (req, res) => {
    res.json(tickets.updateTicket(req.user, req.valid.params.id, req.valid.body, repos.users.listAdmins()));
  });

  // Public reply to the author
  router.post('/tickets/:id/messages', validate(schemas.message), (req, res) => {
    res.status(201).json(tickets.adminReply(req.user, req.valid.params.id, req.valid.body));
  });

  // Internal notes (never visible to authors)
  router.post('/tickets/:id/notes', validate(schemas.note), (req, res) => {
    res.status(201).json({ notes: tickets.addNote(req.user, req.valid.params.id, req.valid.body.body) });
  });

  // ---- AI ----------------------------------------------------------------------------------
  // GET only READS the saved draft (204 if none) - it never calls the LLM. POST is the single explicit
  // generate/regenerate action, triggered by the admin clicking "Generate AI Response".
  router.get('/tickets/:id/draft', validate(schemas.one), (req, res) => {
    const draft = tickets.getDraft(req.user, req.valid.params.id);
    if (!draft) return res.status(204).end();
    return res.json(draft);
  });
  router.post('/tickets/:id/draft', regenerateLimiter, validate(schemas.one), asyncHandler(async (req, res) => {
    res.json(await tickets.generateDraft(req.user, req.valid.params.id));
  }));
  router.post('/tickets/:id/reclassify', regenerateLimiter, validate(schemas.one), asyncHandler(async (req, res) => {
    res.json(await tickets.reclassify(req.user, req.valid.params.id));
  }));

  router.get('/ai/status', (_req, res) => res.json(ai.status()));
  router.get('/ai/usage', (_req, res) => {
    const summary = repos.ai.usageSummary();
    const { inputPerMTok, outputPerMTok, cacheReadPerMTok } = config.ai.pricing;
    const { inputTokens, outputTokens, cacheReadTokens } = summary.totals;
    const estimatedCostUsd = (inputTokens * inputPerMTok + outputTokens * outputPerMTok + cacheReadTokens * cacheReadPerMTok) / 1e6;
    res.json({ ...summary, estimatedCostUsd, status: ai.status() });
  });

  // ---- dashboard / lookups -----------------------------------------------------------------
  router.get('/stats', (_req, res) => res.json(repos.tickets.stats()));
  router.get('/admins', (_req, res) => res.json({ items: repos.users.listAdmins() }));
  router.get('/authors', (_req, res) => res.json({ items: repos.books.listAuthors() }));

  return router;
}
