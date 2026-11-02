import { createContainer } from '../src/container.js';
import { createDatabase } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { knowledgeFor } from '../src/services/ai/knowledgeBase.js';
import { buildFacts } from '../src/services/ai/facts.js';
import { toBookFacts } from '../src/repositories/books.js';
import { checkDraftQuality } from '../src/services/ai/quality.js';
import { checkReplyContent, SAMPLES } from './samples.js';

/**
 * Run the sample queries end to end through the REAL application services (ticket creation -> triage -> draft),
 * against a throw-away in-memory database seeded with the provided dataset. Never touches the real database.
 *
 * @param {object|null|undefined} aiProvider undefined = build from the environment (live OpenAI, costs money),
 *                                           null = no AI (rule-based triage + template drafts)
 */
export async function runEval({ aiProvider, log = () => {} } = {}) {
  const db = createDatabase(':memory:');
  seedDatabase(db, { withDemoTickets: false });
  const container = createContainer({ db, aiProvider });
  const admin = container.repos.users.toUser(container.repos.users.findByEmailWithHash('admin@bookleaf.com'));
  const results = [];

  try {
    for (const sample of SAMPLES) {
      const user = container.repos.users.toUser(container.repos.users.findByEmailWithHash(sample.author));
      const created = container.tickets.createTicket(user, { bookId: sample.bookId, subject: sample.subject, description: sample.description });
      await container.tickets.whenIdle();
      const detail = container.tickets.getForAdmin(admin, created.id);
      const draft = await container.tickets.getDraft(admin, created.id);
      const t = detail.ticket;

      const bookRow = toBookFacts(container.repos.books.findRow(sample.bookId));
      const authorRow = container.repos.books.findAuthor(user.authorId);
      const groundTruth = [buildFacts({ category: t.category ?? sample.category, author: authorRow, book: bookRow, books: [bookRow] }), knowledgeFor(t.category ?? sample.category), sample.subject, sample.description].join('\n');
      const quality = checkDraftQuality({ reply: draft.body, category: t.category ?? sample.category, authorName: authorRow.name, responderName: admin.name.replace(/\s*\(.*\)\s*$/, ''), groundTruth });
      const draftCalls = db.prepare("SELECT COUNT(*) n FROM ai_usage WHERE ticket_id = ? AND purpose = 'draft'").get(created.id).n;

      const checks = {
        category: t.category === sample.category,
        priority: sample.priorities.includes(t.priority),
        tone_and_grounding: quality.ok,
        content: checkReplyContent(sample, draft.body),
      };
      const aiUsed = t.categorySource === 'ai' && draft.source === 'ai';
      const pass = checks.category && checks.priority && checks.tone_and_grounding && checks.content.length === 0;
      const result = { id: sample.id, expectedCategory: sample.category, category: t.category, priority: t.priority, categorySource: t.categorySource, draftSource: draft.source, draftCalls, aiUsed, pass, qualityProblems: quality.problems, contentFailures: checks.content, checks, reply: draft.body };
      results.push(result);
      log(result);
    }
    const usage = container.repos.ai.usageSummary().totals;
    return { results, usage, passed: results.filter((r) => r.pass).length, total: results.length };
  } finally {
    container.close();
    db.close();
  }
}
