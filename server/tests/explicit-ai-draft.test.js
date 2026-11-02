import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ADMIN_PASSWORD, AIError, AUTHOR_PASSWORD, as, buildApp, login } from './helpers.js';

/**
 * AI reply drafts are generated ONLY when an admin explicitly asks (POST /admin/tickets/:id/draft, the
 * "Generate AI Response" button). Opening a ticket - in any way the API offers - must cost zero draft tokens.
 * Triage (category + priority) is a separate, unchanged workflow.
 */
describe('explicit, admin-initiated AI response generation', () => {
  let ctx; let api; let priya; let admin;
  before(async () => {
    ctx = buildApp();
    api = ctx.request();
    priya = await login(api, 'priya.sharma@email.com', AUTHOR_PASSWORD);
    admin = await login(api, 'admin@bookleaf.com', ADMIN_PASSWORD);
  });
  after(() => ctx.container.close());

  const draftCalls = () => ctx.provider.calls.filter((c) => c.tool === 'submit_reply').length;
  const classifyCalls = () => ctx.provider.calls.filter((c) => c.tool === 'classify_ticket').length;
  const draftUsageRows = (id) => ctx.db.prepare("SELECT COUNT(*) n FROM ai_usage WHERE ticket_id = ? AND purpose = 'draft'").get(id).n;
  const savedDrafts = (id) => ctx.db.prepare('SELECT COUNT(*) n FROM ai_drafts WHERE ticket_id = ?').get(id).n;
  const adminMessages = (id) => ctx.db.prepare("SELECT COUNT(*) n FROM ticket_messages WHERE ticket_id = ? AND sender_role = 'admin'").get(id).n;

  const newTicket = async () => {
    const res = await api.post('/api/v1/tickets').set(as(priya)).send({ bookId: 'BK001', subject: 'Royalty question', description: 'Where is my royalty payment? Please explain the calculation.' });
    await ctx.container.tickets.whenIdle();
    return res.body;
  };
  const open = (id) => api.get(`/api/v1/admin/tickets/${id}`).set(as(admin));
  const readDraft = (id) => api.get(`/api/v1/admin/tickets/${id}/draft`).set(as(admin));
  const generate = (id) => api.post(`/api/v1/admin/tickets/${id}/draft`).set(as(admin));

  it('opening a ticket never generates a draft, but triage still ran', async () => {
    const calls0 = draftCalls(); const classify0 = classifyCalls();
    const t = await newTicket();
    assert.equal(classifyCalls(), classify0 + 1, 'classification is unaffected');
    const detail = await open(t.id);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.ticket.category, 'Royalty & Payments', 'category + priority still scored automatically');
    assert.equal(detail.body.ticket.priority, 'High');
    assert.equal(draftCalls(), calls0, 'no draft LLM call from creating or opening the ticket');
    assert.equal(draftUsageRows(t.id), 0, 'no draft tokens metered');
    assert.equal(savedDrafts(t.id), 0, 'nothing written either');
  });

  it('GET /draft is read-only: 204 when no draft exists, and it does not call the LLM', async () => {
    const t = await newTicket();
    const calls0 = draftCalls();
    for (let i = 0; i < 3; i += 1) {
      const res = await readDraft(t.id);
      assert.equal(res.status, 204);
    }
    assert.equal(draftCalls(), calls0);
    assert.equal(savedDrafts(t.id), 0);
  });

  it('one click = exactly one generation request', async () => {
    const t = await newTicket();
    const calls0 = draftCalls();
    const res = await generate(t.id);
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'ai');
    assert.equal(res.body.cached, false);
    assert.match(res.body.body, /^Hi Priya,/);
    assert.equal(draftCalls(), calls0 + 1);
    assert.equal(draftUsageRows(t.id), 1, 'tokens metered for the explicit generation only');
  });

  it('an existing draft is shown from storage on reopen - no silent regeneration', async () => {
    const t = await newTicket();
    const made = await generate(t.id);
    const calls0 = draftCalls();
    for (let i = 0; i < 3; i += 1) {
      await open(t.id);
      const again = await readDraft(t.id);
      assert.equal(again.status, 200);
      assert.equal(again.body.cached, true);
      assert.equal(again.body.body, made.body.body);
      assert.equal(again.body.stale, false);
    }
    assert.equal(draftCalls(), calls0, 'reopening three times cost zero tokens');
  });

  it('a draft whose conversation changed is returned flagged stale, and still not regenerated', async () => {
    const t = await newTicket();
    await generate(t.id);
    await api.post(`/api/v1/tickets/${t.id}/messages`).set(as(priya)).send({ body: 'Following up - any news?' });
    const calls0 = draftCalls();
    const res = await readDraft(t.id);
    assert.equal(res.status, 200);
    assert.equal(res.body.stale, true);
    assert.equal(draftCalls(), calls0);
  });

  it('regeneration happens only after an explicit request', async () => {
    const t = await newTicket();
    await generate(t.id);
    const calls0 = draftCalls();
    await open(t.id); await readDraft(t.id);
    assert.equal(draftCalls(), calls0, 'reads do not regenerate');
    const again = await generate(t.id);
    assert.equal(again.body.cached, false);
    assert.equal(draftCalls(), calls0 + 1);
  });

  it('a generated draft is only text: nothing is sent to the author until the admin sends it', async () => {
    const t = await newTicket();
    const generated = await generate(t.id);
    assert.equal(adminMessages(t.id), 0, 'generating does not send');
    assert.equal((await api.get(`/api/v1/tickets/${t.id}`).set(as(priya))).body.messages.length, 0, 'the author sees nothing');

    // The admin edits the draft before sending; the edited text, not the draft, is what is stored.
    const edited = `${generated.body}\n\nP.S. I have also asked Finance to double-check the bank details on file.`;
    const sent = await api.post(`/api/v1/admin/tickets/${t.id}/messages`).set(as(admin)).send({ body: edited, aiAssisted: true });
    assert.equal(sent.status, 201);
    assert.equal(adminMessages(t.id), 1);
    const visible = (await api.get(`/api/v1/tickets/${t.id}`).set(as(priya))).body.messages.at(-1);
    assert.equal(visible.body, edited, 'the edited draft is what the author receives');
  });

  it('AI failure on an explicit request gives a labelled template fallback (200) and is not retried by reading', async () => {
    const t = await newTicket();
    ctx.provider.failWith = new AIError('quota', 'billing', { retryable: false });
    try {
      const res = await generate(t.id);
      assert.equal(res.status, 200);
      assert.equal(res.body.source, 'template');
      assert.match(res.body.notes[0], /AI draft unavailable/);
      const calls0 = draftCalls();
      assert.equal((await readDraft(t.id)).body.source, 'template');
      assert.equal(draftCalls(), calls0, 'reading the fallback does not retry the AI');
    } finally { ctx.provider.failWith = null; }
  });

  it('closed tickets: neither reading nor generating a draft is allowed', async () => {
    const t = await newTicket();
    await api.patch(`/api/v1/admin/tickets/${t.id}`).set(as(admin)).send({ status: 'Closed' });
    const calls0 = draftCalls();
    assert.equal((await readDraft(t.id)).status, 409);
    assert.equal((await generate(t.id)).status, 409);
    assert.equal(draftCalls(), calls0);
  });

  it('authors can neither read nor generate drafts', async () => {
    const t = await newTicket();
    const calls0 = draftCalls();
    assert.equal((await api.get(`/api/v1/admin/tickets/${t.id}/draft`).set(as(priya))).status, 403);
    assert.equal((await api.post(`/api/v1/admin/tickets/${t.id}/draft`).set(as(priya))).status, 403);
    assert.equal(draftCalls(), calls0);
  });
});
