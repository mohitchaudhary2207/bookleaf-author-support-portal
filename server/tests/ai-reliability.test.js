import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ADMIN_PASSWORD, AIError, AUTHOR_PASSWORD, as, buildApp, createFakeProvider, login } from './helpers.js';
import { createAIService } from '../src/services/ai/aiService.js';
import { buildFacts } from '../src/services/ai/facts.js';
import { knowledgeFor } from '../src/services/ai/knowledgeBase.js';
import { buildDraftSystem } from '../src/services/ai/prompts.js';
import { BANNED_PHRASES, checkDraftQuality } from '../src/services/ai/quality.js';
import { buildTemplateDraft } from '../src/services/ai/templates.js';
import { CATEGORIES } from '../src/config/constants.js';
import { royaltyCycle } from '../src/services/royalty.js';
import { formatDate } from '../src/utils/dates.js';

const SETTINGS = { enabled: true, breakerThreshold: 3, breakerCooldownMs: 1000, maxTicketChars: 500, classifyMaxTokens: 100, draftMaxTokens: 100, maxThreadMessages: 3 };

// --------------------------------------------------------------------------------------------------------------
// A. The real failure reason survives the circuit breaker
// --------------------------------------------------------------------------------------------------------------
describe('AI failure reason is preserved while the circuit breaker is open', () => {
  const REASONS = [
    ['auth', /rejected the API key/],
    ['quota', /run out of quota/],
    ['rate_limited', /rate-limiting/],
    ['timeout', /timed out/],
    ['unavailable', /unreachable/],
  ];

  for (const [reason, text] of REASONS) {
    it(`${reason}: admin sees the real cause (not "unreachable") after the breaker opens; no further provider calls`, async () => {
      const ctx = buildApp();
      const api = ctx.request();
      const priya = await login(api, 'priya.sharma@email.com', AUTHOR_PASSWORD);
      const admin = await login(api, 'admin@bookleaf.com', ADMIN_PASSWORD);
      try {
        ctx.provider.failWith = new AIError(reason, `simulated ${reason} with SECRET-DETAIL-sk-123456`, { retryable: true });
        let last;
        for (let i = 0; i < 4; i += 1) {          // default threshold = 4 consecutive failures
          last = (await api.post('/api/v1/tickets').set(as(priya)).send({ bookId: 'BK001', subject: `Royalty question ${i}`, description: 'Where is my royalty payment this quarter please?' })).body;
          assert.equal(typeof last.id, 'number', 'tickets are still created while the AI is failing');
        }
        await ctx.container.tickets.whenIdle();

        const status = (await api.get('/api/v1/admin/ai/status').set(as(admin))).body;
        assert.equal(status.available, false);
        assert.equal(status.reason, 'cooling_down');
        assert.equal(status.lastFailure.reason, reason);
        assert.ok(!JSON.stringify(status).includes('SECRET-DETAIL'), 'raw provider text / credentials are never exposed');

        const callsBefore = ctx.provider.calls.length;
        const draft = (await api.post(`/api/v1/admin/tickets/${last.id}/draft`).set(as(admin)));
        assert.equal(draft.status, 200, 'draft endpoint still answers (template) while paused');
        assert.equal(draft.body.source, 'template');
        assert.match(draft.body.notes[0], text, draft.body.notes[0]);
        assert.match(draft.body.notes[0], /temporarily paused/);
        if (reason !== 'unavailable') assert.doesNotMatch(draft.body.notes[0], /unreachable/);
        assert.ok(!JSON.stringify(draft.body).includes('SECRET-DETAIL'));
        assert.equal(ctx.provider.calls.length, callsBefore, 'paused: the provider is not called');

        // manual operation continues
        const reply = await api.post(`/api/v1/admin/tickets/${last.id}/messages`).set(as(admin)).send({ body: 'Hi Priya, writing this one by hand while AI is paused.' });
        assert.equal(reply.status, 201);
        // the usage log records the real category of each failed call
        const usage = (await api.get('/api/v1/admin/ai/usage').set(as(admin))).body;
        assert.ok(usage.recentErrors.every((e) => e.error.startsWith(`${reason}:`)), JSON.stringify(usage.recentErrors));
      } finally { ctx.container.close(); }
    });
  }

  it('status keeps lastFailure while paused and clears it after the provider recovers', async () => {
    let clock = 0; let fail = new AIError('auth', 'bad key');
    const provider = { model: 'm', async callTool() { if (fail) throw fail; return { input: { category: 'General Inquiry', priority: 'Low', confidence: 0.9, rationale: 'x' }, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 }, model: 'm' }; } };
    const ai = createAIService({ provider, settings: SETTINGS, now: () => clock });
    for (let i = 0; i < 3; i += 1) await ai.triage({ ticketId: i, subject: 's', description: 'royalty question please help', book: null });
    assert.deepEqual([ai.status().available, ai.status().reason, ai.status().lastFailure.reason], [false, 'cooling_down', 'auth']);
    const paused = await ai.triage({ ticketId: 9, subject: 's', description: 'royalty question please help', book: null });
    assert.deepEqual([paused.degraded, paused.reason, paused.paused], [true, 'auth', true]);
    clock = 5000; fail = null;                       // cool-down over, provider healthy again
    const ok = await ai.triage({ ticketId: 10, subject: 's', description: 'x', book: null });
    assert.equal(ok.degraded, false);
    assert.equal(ai.status().lastFailure, null);
    assert.equal(ai.status().available, true);
  });
});

// --------------------------------------------------------------------------------------------------------------
// B. Quality gate (pure checks)
// --------------------------------------------------------------------------------------------------------------
const SIGN = 'Warm regards,\nRiya Mehta\nBookLeaf Support';
const base = { authorName: 'Priya Sharma', responderName: 'Riya Mehta', category: 'General Inquiry', groundTruth: 'Pending ₹3,570. Payout due by 14 November 2026. Minimum payout Rs 1,000.' };
const reply = (body) => `Hi Priya,\n\n${body}\n\n${SIGN}`;
const GOOD_BODY = 'Your pending royalty is ₹3,570 and it will be paid by 14 November 2026. Please confirm your bank details in the dashboard so nothing delays the transfer.';

describe('draft quality gate', () => {
  it('accepts a grounded, well-formed reply', () => {
    const r = checkDraftQuality({ ...base, reply: reply(GOOD_BODY) });
    assert.deepEqual(r, { ok: true, problems: [] });
  });

  it('detects every banned stock phrase', () => {
    const samples = ['I understand that this is frustrating for you.', "I'm sorry to hear about the delay.", 'I am sorry to hear this happened.', 'I hope this finds you well.', 'Thank you for reaching out about this.', 'Rest assured, we are on it.', 'As an AI I cannot do that.'];
    assert.equal(samples.length, BANNED_PHRASES.length);
    for (const s of samples) {
      const r = checkDraftQuality({ ...base, reply: reply(`${s} ${GOOD_BODY}`) });
      assert.equal(r.ok, false, s);
      assert.ok(r.problems.some((p) => /stock phrase|AI/.test(p)), `${s} -> ${r.problems}`);
    }
  });

  it('banned-phrase detection is case-insensitive and tolerates curly apostrophes', () => {
    assert.equal(checkDraftQuality({ ...base, reply: reply(`i understand your worry. ${GOOD_BODY}`) }).ok, false);
    assert.equal(checkDraftQuality({ ...base, reply: reply(`I’m sorry to hear that. ${GOOD_BODY}`) }).ok, false);
  });

  it('requires the exact BookLeaf signature and the greeting', () => {
    assert.equal(checkDraftQuality({ ...base, reply: `Hi Priya,\n\n${GOOD_BODY}\n\nBest,\nRiya` }).ok, false);
    assert.equal(checkDraftQuality({ ...base, reply: `Hi Priya,\n\n${GOOD_BODY}\n\nWarm regards,\nSomeone Else\nBookLeaf Support` }).ok, false);
    assert.equal(checkDraftQuality({ ...base, reply: `Dear Priya,\n\n${GOOD_BODY}\n\n${SIGN}` }).ok, false);
    assert.equal(checkDraftQuality({ ...base, reply: `Hi Anita,\n\n${GOOD_BODY}\n\n${SIGN}` }).ok, false, 'wrong first name');
  });

  it('Printing & Quality must open with a sincere apology (after the greeting)', () => {
    const printing = { ...base, category: 'Printing & Quality' };
    const noApology = checkDraftQuality({ ...printing, reply: reply('The print quality issue with your copies is concerning. Please share photos of the defective copies and we will arrange a free reprint in 5-7 business days.') });
    assert.equal(noApology.ok, false);
    assert.match(noApology.problems.join(' '), /sincere apology/);
    const lateApology = checkDraftQuality({ ...printing, reply: `Hi Priya,\n\nPlease share photos of the defective copies so we can verify them.\n\nI'm truly sorry that the pages were misaligned.\n\n${SIGN}` });
    assert.equal(lateApology.ok, false, 'an apology buried in a later paragraph does not count');
    for (const opener of ["I'm truly sorry that your copies arrived with misaligned pages.", 'We sincerely apologise for the blurry images in your author copies.', 'Our apologies - the binding on your copies should never have left our press.']) {
      const ok = checkDraftQuality({ ...printing, reply: reply(`${opener} Please share photos of the defective copies; once verified we arrange a free reprint within 5-7 business days.`) });
      assert.equal(ok.ok, true, `${opener} -> ${ok.problems}`);
    }
    // the same text without an apology is fine for other categories
    assert.equal(checkDraftQuality({ ...base, reply: reply('Please share photos of the defective copies so we can verify them for a free reprint in 5-7 business days.') }).ok, true);
  });

  it('rejects invented amounts and dates (grounded business facts only)', () => {
    const invented = checkDraftQuality({ ...base, reply: reply('Your pending royalty is ₹99,999 and will be paid by 14 November 2026, which is well within policy.') });
    assert.equal(invented.ok, false);
    assert.match(invented.problems.join(' '), /amount \(₹99,999\)/);
    const wrongDate = checkDraftQuality({ ...base, reply: reply('Your pending royalty is ₹3,570 and will be paid by 2 December 2026, which is well within policy.') });
    assert.equal(wrongDate.ok, false);
    assert.match(wrongDate.problems.join(' '), /date \(2 December 2026\)/);
    // "Rs 1,000" minimum payout comes from the knowledge base text; numeric formats are normalised
    assert.equal(checkDraftQuality({ ...base, reply: reply('Payouts start once the balance reaches Rs 1,000, and your balance of ₹3570 qualifies for 14 November 2026.') }).ok, true);
  });

  it('enforces a sane length', () => {
    assert.match(checkDraftQuality({ ...base, reply: reply('Done.') }).problems.join(' '), /too short/);
    assert.match(checkDraftQuality({ ...base, reply: reply('word '.repeat(400)) }).problems.join(' '), /too long/);
  });

  it('every policy-template draft passes the same gate (the fallback is itself compliant and grounded)', () => {
    const author = { name: 'Priya Sharma', author_id: 'AUTH001', city: 'Mumbai', joined_date: '2023-03-15' };
    const book = { book_id: 'BK001', title: 'Whispers of the Ganges', status: 'Published & Live', publication_date: '2023-06-20', mrp: 399, author_royalty_per_copy: 35, total_copies_sold: 342, total_royalty_earned: 11970, royalty_paid: 8400, royalty_pending: 3570, last_royalty_payout_date: '2025-10-15', print_partner: 'In-House', available_on: ['Amazon India'], isbn: 'x', genre: 'g' };
    const now = new Date();
    for (const category of CATEGORIES) {
      const t = buildTemplateDraft({ category, author, book, books: [book], responderName: 'Riya Mehta', now });
      const groundTruth = [buildFacts({ category, author, book, books: [book], now }), knowledgeFor(category)].join('\n');
      const r = checkDraftQuality({ reply: t.reply, category, authorName: author.name, responderName: 'Riya Mehta', groundTruth });
      assert.deepEqual(r.problems, [], `${category}: ${r.problems.join('; ')}`);
    }
  });

  it('the draft prompts carry the rules the gate enforces', () => {
    assert.match(buildDraftSystem('Royalty & Payments'), /NEVER write "I understand"/);
    assert.match(buildDraftSystem('Printing & Quality'), /FIRST paragraph after the greeting must be a sincere apology/);
    assert.doesNotMatch(buildDraftSystem('Royalty & Payments'), /sincere apology that names/);
  });
});

// --------------------------------------------------------------------------------------------------------------
// C. Quality gate inside the draft pipeline: one regeneration, then template fallback; never infinite retries
// --------------------------------------------------------------------------------------------------------------
describe('draft pipeline: quality validation, controlled regeneration, fallback', () => {
  let ctx; let api; let priya; let admin; let provider;
  before(async () => {
    provider = createFakeProvider();
    ctx = buildApp({ provider });
    api = ctx.request();
    priya = await login(api, 'priya.sharma@email.com', AUTHOR_PASSWORD);
    admin = await login(api, 'admin@bookleaf.com', ADMIN_PASSWORD);
  });
  after(() => ctx.container.close());

  const payoutDate = formatDate(royaltyCycle(new Date()).nextPayoutBy);
  const GOOD_ROYALTY = reply(`Your pending royalty for "Whispers of the Ganges" is ₹3,570, and it will be paid in the payout run due by ${payoutDate}. Please confirm your bank details in the dashboard.`);
  const BAD_STOCK = reply(`I understand that waiting is hard. ${GOOD_BODY}`);
  const draftCalls = () => provider.calls.filter((c) => c.tool === 'submit_reply').length;
  const ticket = async (classification, subject = 'Royalty question', description = 'Where is my royalty payment this quarter? Please explain.') => {
    provider.classification = { category: 'Royalty & Payments', priority: 'High', confidence: 0.9, rationale: 'x', ...classification };
    const t = (await api.post('/api/v1/tickets').set(as(priya)).send({ bookId: 'BK001', subject, description })).body;
    await ctx.container.tickets.whenIdle();
    return t;
  };

  it('a draft that passes is returned after exactly one provider call', async () => {
    const t = await ticket({});
    provider.replyQueue.push(GOOD_ROYALTY);
    const before = draftCalls();
    const d = (await api.post(`/api/v1/admin/tickets/${t.id}/draft`).set(as(admin))).body;
    assert.equal(d.source, 'ai');
    assert.equal(draftCalls() - before, 1);
    assert.equal(d.body, GOOD_ROYALTY);
  });

  it('a stock-phrase draft is regenerated ONCE with corrective feedback, and the good second draft is used', async () => {
    const t = await ticket({});
    provider.replyQueue.push(BAD_STOCK, GOOD_ROYALTY);
    const before = draftCalls();
    const d = (await api.post(`/api/v1/admin/tickets/${t.id}/draft`).set(as(admin))).body;
    assert.equal(d.source, 'ai');
    assert.equal(d.body, GOOD_ROYALTY);
    assert.equal(draftCalls() - before, 2, 'exactly one corrective regeneration');
    const retryPrompt = provider.calls.filter((c) => c.tool === 'submit_reply').at(-1).user;
    assert.match(retryPrompt, /REVISION REQUIRED/);
    assert.match(retryPrompt, /stock phrase/);
  });

  it('Printing complaint without an apology is rejected, then accepted once it opens with one', async () => {
    const t = await ticket({ category: 'Printing & Quality' }, 'Print quality is terrible', 'The images are blurry and the pages are misaligned in my author copies.');
    const noApology = reply('The print quality issue with your author copies is a problem. Please share photos of the defective copies and we will arrange a free reprint in 5-7 business days.');
    const withApology = reply('I\'m truly sorry that your author copies arrived with blurry images and misaligned pages. Please share photos of the defective copies; once verified we arrange a free reprint in 5-7 business days.');
    provider.replyQueue.push(noApology, withApology);
    const before = draftCalls();
    const d = (await api.post(`/api/v1/admin/tickets/${t.id}/draft`).set(as(admin))).body;
    assert.equal(d.source, 'ai');
    assert.match(d.body, /^Hi Priya,\n\nI'm truly sorry/);
    assert.equal(draftCalls() - before, 2);
  });

  it('two failing drafts -> policy template (no 3rd call, no infinite retry); notes explain why; nothing is auto-sent', async () => {
    const t = await ticket({});
    provider.replyQueue.push(BAD_STOCK, reply('Rest assured, this will be sorted soon. Please wait for our team to respond to your message about the royalties.'));
    const before = draftCalls();
    const messagesBefore = (await api.get(`/api/v1/tickets/${t.id}`).set(as(priya))).body.messages.length;
    const d = (await api.post(`/api/v1/admin/tickets/${t.id}/draft`).set(as(admin))).body;
    assert.equal(d.source, 'template');
    assert.equal(draftCalls() - before, 2, 'at most one regeneration');
    assert.match(d.notes.join(' '), /did not pass the BookLeaf tone and accuracy checks/);
    assert.match(d.notes.join(' '), /Rejected AI draft:/);
    assert.match(d.body, /^Hi Priya,/);
    assert.equal((await api.get(`/api/v1/tickets/${t.id}`).set(as(priya))).body.messages.length, messagesBefore, 'a draft is never delivered to the author');
  });

  it('an invented amount is rejected even if the tone is perfect', async () => {
    const t = await ticket({});
    const invented = reply(`Your pending royalty is ₹99,999 and will be paid in the run due by ${payoutDate}. Please confirm your bank details in the dashboard today.`);
    provider.replyQueue.push(invented, GOOD_ROYALTY);
    const d = (await api.post(`/api/v1/admin/tickets/${t.id}/draft`).set(as(admin))).body;
    assert.equal(d.source, 'ai');
    assert.doesNotMatch(d.body, /99,999/);
    assert.match(provider.calls.filter((c) => c.tool === 'submit_reply').at(-1).user, /amount \(₹99,999\)/);
  });

  it('quality-failure fallbacks do not trip the circuit breaker and are metered as two calls', async () => {
    const t = await ticket({});
    provider.replyQueue.push(BAD_STOCK, BAD_STOCK);
    await api.post(`/api/v1/admin/tickets/${t.id}/draft`).set(as(admin));
    assert.equal((await api.get('/api/v1/admin/ai/status').set(as(admin))).body.available, true);
    const usage = (await api.get('/api/v1/admin/ai/usage').set(as(admin))).body;
    assert.ok(usage.byPurpose.find((p) => p.purpose === 'draft').calls >= 2);
  });

  it('admin_notes from the model are preserved on an accepted draft', async () => {
    const t = await ticket({});
    provider.replyQueue.push(GOOD_ROYALTY);
    const d = (await api.post(`/api/v1/admin/tickets/${t.id}/draft`).set(as(admin))).body;
    assert.deepEqual(d.notes, ['Check bank details']);
  });
});

describe('category rules in the draft system prompt', () => {
  it('Royalty & Payments explains the net-profit calculation and forbids "share of the MRP" wording', () => {
    const prompt = buildDraftSystem('Royalty & Payments');
    assert.match(prompt, /net profit = MRP minus printing cost, platform commission/);
    assert.match(prompt, /line-by-line royalty breakdown/);
    assert.match(prompt, /Never describe the per-copy royalty as a share of the MRP/);
    assert.doesNotMatch(buildDraftSystem('Distribution & Availability'), /CATEGORY RULE \(Royalty/);
  });
});
