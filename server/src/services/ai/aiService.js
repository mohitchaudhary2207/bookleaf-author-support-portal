import crypto from 'node:crypto';
import { z } from 'zod';
import { CATEGORIES, PRIORITIES, PRIORITY_RANK } from '../../config/constants.js';
import { AIError } from './aiError.js';
import { buildFacts, bookOneLiner } from './facts.js';
import { buildClassifyUser, buildDraftSystem, buildDraftUser, CLASSIFY_SYSTEM, CLASSIFY_TOOL, DRAFT_TOOL } from './prompts.js';
import { ruleBasedTriage } from './rules.js';
import { buildTemplateDraft } from './templates.js';

const triageSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  confidence: z.number().min(0).max(1).catch(0.5),
  rationale: z.string().max(400).catch(''),
});

const draftSchema = z.object({
  reply: z.string().min(20).max(4000),
  admin_notes: z.array(z.string().max(300)).max(5).catch([]),
});

/**
 * Business-rule guardrails applied AFTER the model answers. The model proposes; policy disposes.
 * (BookLeaf policy: ISBN errors are always at least High priority.)
 */
const ISBN_ERROR = /isbn|duplicate|mismatch|different|wrong|incorrect|linked/i;

export function applyPolicyFloor({ category, priority }, text = '') {
  // A pure "please update my description" request may stay Low; an ISBN *error* may not.
  if (category === 'ISBN & Metadata Issues' && /isbn/i.test(text) && ISBN_ERROR.test(text) && PRIORITY_RANK[priority] > PRIORITY_RANK.High) {
    return { priority: 'High', floored: true };
  }
  return { priority, floored: false };
}

/**
 * AI orchestration: triage + draft, with cost control, a circuit breaker and graceful fallbacks.
 *
 * Contract: `triage()` and `draft()` NEVER throw. On any AI failure they return a usable
 * fallback result (rule-based triage / template draft) tagged with `degraded` + `reason`, so
 * ticket creation and the admin workflow keep working when the provider is down.
 */
export function createAIService({ provider, settings, onUsage = () => {}, logger, now = () => Date.now() }) {
  const breaker = { failures: 0, openUntil: 0 };

  const status = () => {
    if (!settings.enabled) return { available: false, reason: 'disabled' };
    if (!provider) return { available: false, reason: 'not_configured' };
    if (breaker.openUntil > now()) return { available: false, reason: 'cooling_down' };
    return { available: true, reason: null };
  };

  const recordFailure = (err) => {
    // Only infrastructure problems should trip the breaker, not one malformed answer.
    if (!['invalid_response', 'refused'].includes(err.reason)) {
      breaker.failures += 1;
      if (breaker.failures >= settings.breakerThreshold) {
        breaker.openUntil = now() + settings.breakerCooldownMs;
        breaker.failures = 0;
        logger?.warn(`AI circuit breaker open for ${settings.breakerCooldownMs / 1000}s (${err.reason})`);
      }
    }
  };

  /** Run one provider call with metering. Throws AIError. */
  async function call({ purpose, ticketId, system, user, tool, maxTokens }) {
    const { available, reason } = status();
    if (!available) throw new AIError(reason === 'cooling_down' ? 'unavailable' : 'disabled', `AI unavailable (${reason})`);
    const started = now();
    try {
      const result = await provider.callTool({ system, user, tool, maxTokens });
      breaker.failures = 0;
      onUsage({ ticketId, purpose, model: result.model, ...result.usage, latencyMs: now() - started, ok: true });
      return result;
    } catch (err) {
      const aiErr = err instanceof AIError ? err : new AIError('unavailable', err?.message ?? 'AI error', { cause: err });
      recordFailure(aiErr);
      onUsage({ ticketId, purpose, model: provider?.model ?? 'n/a', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, latencyMs: now() - started, ok: false, error: `${aiErr.reason}: ${aiErr.message}` });
      throw aiErr;
    }
  }

  return {
    status,

    /**
     * Classify + prioritise a ticket in ONE call. Input is the ticket text (truncated) plus a
     * one-line book summary - never the thread history or the knowledge base.
     */
    async triage({ ticketId, subject, description, book }) {
      const fallback = (reason) => ({ ...ruleBasedTriage({ subject, description }), degraded: true, reason });
      try {
        const result = await call({
          purpose: 'classify',
          ticketId,
          system: CLASSIFY_SYSTEM,
          user: buildClassifyUser({ subject, description, bookLine: bookOneLiner(book, new Date(now())), maxChars: settings.maxTicketChars }),
          tool: CLASSIFY_TOOL,
          maxTokens: settings.classifyMaxTokens,
        });
        const parsed = triageSchema.safeParse(result.input);
        if (!parsed.success) throw new AIError('invalid_response', 'AI returned an invalid classification');
        const { priority } = applyPolicyFloor(parsed.data, `${subject}\n${description}`);
        return { ...parsed.data, priority, source: 'ai', degraded: false, model: result.model };
      } catch (err) {
        logger?.warn(`AI triage fell back to rules for ticket ${ticketId}: ${err.reason ?? ''} ${err.message}`);
        return fallback(err.reason ?? 'unavailable');
      }
    },

    /**
     * Draft a reply. The prompt carries: category-specific policy, FACTS for the referenced book
     * only, and at most the last N thread messages (truncated) - not the whole history.
     */
    async draft({ ticket, author, book, books, thread, responderName }) {
      const nowDate = new Date(now());
      const recent = thread.slice(-settings.maxThreadMessages);
      const facts = buildFacts({ category: ticket.category, author, book, books, now: nowDate });
      const templateFallback = (reason) => ({
        ...buildTemplateDraft({ category: ticket.category, author, book, books, responderName, now: nowDate }),
        source: 'template',
        degraded: true,
        reason,
        model: null,
      });

      try {
        const result = await call({
          purpose: 'draft',
          ticketId: ticket.id,
          system: buildDraftSystem(ticket.category),
          user: buildDraftUser({
            ticketNumber: ticket.ticket_number,
            category: ticket.category,
            priority: ticket.priority,
            createdAtLabel: ticket.created_at.slice(0, 10),
            subject: ticket.subject,
            description: ticket.description,
            authorName: author.name,
            facts,
            thread: recent,
            responderName,
            maxChars: settings.maxTicketChars,
          }),
          tool: DRAFT_TOOL,
          maxTokens: settings.draftMaxTokens,
        });
        const parsed = draftSchema.safeParse(result.input);
        if (!parsed.success) throw new AIError('invalid_response', 'AI returned an unusable draft');
        return { ...parsed.data, source: 'ai', degraded: false, reason: null, model: result.model };
      } catch (err) {
        logger?.warn(`AI draft fell back to template for ticket ${ticket.id}: ${err.reason ?? ''} ${err.message}`);
        return templateFallback(err.reason ?? 'unavailable');
      }
    },
  };
}

/** Stable hash of everything a draft depends on - used to decide whether a cached draft is stale. */
export function draftInputHash({ ticket, thread, book }) {
  const payload = JSON.stringify([ticket.category, ticket.priority, ticket.subject, ticket.description, book?.royalty_pending ?? null, thread.map((m) => m.id)]);
  return crypto.createHash('sha1').update(payload).digest('hex');
}
