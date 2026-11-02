export function createAIRepo(db) {
  return {
    getDraft: (ticketId) => db.prepare('SELECT * FROM ai_drafts WHERE ticket_id = ?').get(ticketId),

    saveDraft: ({ ticketId, body, source, model, inputHash, notes }) => db.prepare(`
      INSERT INTO ai_drafts (ticket_id, body, source, model, input_hash, notes, generated_at)
      VALUES (@ticketId, @body, @source, @model, @inputHash, @notes, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(ticket_id) DO UPDATE SET body = excluded.body, source = excluded.source, model = excluded.model,
        input_hash = excluded.input_hash, notes = excluded.notes, generated_at = excluded.generated_at
    `).run({ ticketId, body, source, model: model ?? null, inputHash, notes: JSON.stringify(notes ?? []) }),

    deleteDraft: (ticketId) => db.prepare('DELETE FROM ai_drafts WHERE ticket_id = ?').run(ticketId),

    logUsage: (u) => db.prepare(`
      INSERT INTO ai_usage (ticket_id, purpose, model, input_tokens, output_tokens, cache_read_tokens, latency_ms, ok, error)
      VALUES (@ticketId, @purpose, @model, @inputTokens, @outputTokens, @cacheReadTokens, @latencyMs, @ok, @error)
    `).run({ ticketId: u.ticketId ?? null, purpose: u.purpose, model: u.model, inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0, cacheReadTokens: u.cacheReadTokens ?? 0, latencyMs: u.latencyMs ?? null,
      ok: u.ok ? 1 : 0, error: u.error ?? null }),

    usageSummary: () => ({
      totals: db.prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(ok),0) AS succeeded, COALESCE(SUM(1-ok),0) AS failed,
        COALESCE(SUM(input_tokens),0) AS inputTokens, COALESCE(SUM(output_tokens),0) AS outputTokens,
        COALESCE(SUM(cache_read_tokens),0) AS cacheReadTokens, COALESCE(AVG(latency_ms),0) AS avgLatencyMs FROM ai_usage`).get(),
      byPurpose: db.prepare(`SELECT purpose, COUNT(*) AS calls, COALESCE(SUM(input_tokens),0) AS inputTokens,
        COALESCE(SUM(output_tokens),0) AS outputTokens FROM ai_usage GROUP BY purpose`).all(),
      recentErrors: db.prepare(`SELECT created_at AS createdAt, purpose, error FROM ai_usage WHERE ok = 0 ORDER BY id DESC LIMIT 5`).all(),
    }),
  };
}
