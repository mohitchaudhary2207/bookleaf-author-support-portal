import { config } from './config/index.js';
import { createAIRepo } from './repositories/ai.js';
import { createBookRepo } from './repositories/books.js';
import { createTicketRepo } from './repositories/tickets.js';
import { createUserRepo } from './repositories/users.js';
import { createAIService } from './services/ai/aiService.js';
import { createOpenAIProvider } from './services/ai/openaiProvider.js';
import { createEventBus } from './services/events.js';
import { createTicketService } from './services/ticketService.js';
import { logger } from './utils/logger.js';

/**
 * Composition root: the ONE place where concrete implementations are chosen and wired together.
 * Everything below receives its dependencies as arguments, which is what lets the tests swap in
 * an in-memory database and a fake AI provider without touching application code.
 *
 * @param {object} opts
 * @param {import('better-sqlite3').Database} opts.db
 * @param {object|null} [opts.aiProvider]  Provider override. `undefined` = build from env;
 *                                         `null` = run with no AI (manual mode).
 */
export function createContainer({ db, aiProvider, aiSettings = config.ai }) {
  const repos = {
    users: createUserRepo(db),
    books: createBookRepo(db),
    tickets: createTicketRepo(db),
    ai: createAIRepo(db),
  };
  // `aiRepo` alias keeps the ticket service signature readable.
  repos.aiRepo = repos.ai;

  let provider = aiProvider;
  if (provider === undefined) {
    provider = aiSettings.enabled && aiSettings.apiKey
      ? createOpenAIProvider({ apiKey: aiSettings.apiKey, model: aiSettings.model, timeoutMs: aiSettings.timeoutMs, maxRetries: aiSettings.maxRetries })
      : null;
  }
  if (!provider) logger.warn('AI is running in MANUAL mode (no OPENAI_API_KEY or AI_ENABLED=false): rule-based triage + template drafts');

  const ai = createAIService({
    provider,
    settings: aiSettings,
    logger,
    onUsage: (usage) => { try { repos.ai.logUsage(usage); } catch (err) { logger.error('failed to log AI usage', err); } },
  });
  const events = createEventBus();
  const tickets = createTicketService({ db, repos, ai, events, logger });

  return { db, repos, ai, events, tickets, close: () => events.close() };
}
