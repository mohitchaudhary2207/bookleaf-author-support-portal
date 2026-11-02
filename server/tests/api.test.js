import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ADMIN_PASSWORD, AUTHOR_PASSWORD, as, buildApp, login } from './helpers.js';

describe('API: auth, RBAC, validation, ticket lifecycle', () => {
  let ctx; let api; let priya; let rohit; let admin;

  before(async () => {
    ctx = buildApp();
    api = ctx.request();
    priya = await login(api, 'priya.sharma@email.com', AUTHOR_PASSWORD);
    rohit = await login(api, 'rohit.kapoor@email.com', AUTHOR_PASSWORD);
    admin = await login(api, 'admin@bookleaf.com', ADMIN_PASSWORD);
  });
  after(() => ctx.container.close());

  const createTicket = async (token, body = {}) => {
    const res = await api.post('/api/v1/tickets').set(as(token)).send({
      bookId: 'BK001', subject: 'Royalty not received', description: 'I have not received my royalty for six months, please help.', ...body,
    });
    await ctx.container.tickets.whenIdle();
    return res;
  };

  describe('authentication', () => {
    it('rejects wrong password and unknown email with the same generic 401', async () => {
      const a = await api.post('/api/v1/auth/login').send({ email: 'priya.sharma@email.com', password: 'nope' });
      const b = await api.post('/api/v1/auth/login').send({ email: 'ghost@email.com', password: 'nope' });
      assert.equal(a.status, 401);
      assert.equal(b.status, 401);
      assert.equal(a.body.error.message, b.body.error.message);
    });

    it('validates the login payload (422 with per-field details)', async () => {
      const res = await api.post('/api/v1/auth/login').send({ email: 'not-an-email' });
      assert.equal(res.status, 422);
      assert.ok(res.body.error.details.some((d) => d.path === 'email'));
    });

    it('protects every API route without a token', async () => {
      for (const url of ['/api/v1/books', '/api/v1/tickets', '/api/v1/admin/stats', '/api/v1/meta', '/api/v1/events']) {
        const res = await api.get(url);
        assert.equal(res.status, 401, url);
      }
    });

    it('sets an httpOnly session cookie that authenticates follow-up calls', async () => {
      const res = await api.post('/api/v1/auth/login').send({ email: 'priya.sharma@email.com', password: AUTHOR_PASSWORD });
      const cookie = res.headers['set-cookie'][0];
      assert.match(cookie, /HttpOnly/i);
      const me = await api.get('/api/v1/auth/me').set('Cookie', cookie.split(';')[0]);
      assert.equal(me.body.user.authorId, 'AUTH001');
    });

    it('blocks cookie-authenticated cross-site writes (CSRF origin check)', async () => {
      const res = await api.post('/api/v1/auth/login').send({ email: 'priya.sharma@email.com', password: AUTHOR_PASSWORD });
      const cookie = res.headers['set-cookie'][0].split(';')[0];
      const evil = await api.post('/api/v1/tickets').set('Cookie', cookie).set('Origin', 'https://evil.example')
        .send({ subject: 'x'.repeat(5), description: 'y'.repeat(20) });
      assert.equal(evil.status, 403);
    });
  });

  describe('books', () => {
    it("returns only the author's own books with a royalty summary", async () => {
      const res = await api.get('/api/v1/books').set(as(priya));
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.items.map((b) => b.bookId).sort(), ['BK001', 'BK002']);
      assert.equal(res.body.summary.totalRoyaltyEarned, 11970 + 7938);
      assert.equal(res.body.summary.totalRoyaltyPending, 3570);
    });

    it('ignores a spoofed authorId query for authors', async () => {
      const res = await api.get('/api/v1/books?authorId=AUTH002').set(as(priya));
      assert.ok(res.body.items.every((b) => b.authorId === 'AUTH001'));
    });

    it("404s on another author's book", async () => {
      const res = await api.get('/api/v1/books/BK003').set(as(priya));
      assert.equal(res.status, 404);
    });

    it('handles books still in production (no MRP, no sales)', async () => {
      const sneha = await login(api, 'sneha.kulkarni@email.com', AUTHOR_PASSWORD);
      const res = await api.get('/api/v1/books/BK013').set(as(sneha));
      assert.equal(res.body.isPublished, false);
      assert.equal(res.body.mrp, null);
      assert.equal(res.body.productionStage, 'Cover Design');
      assert.equal(res.body.totalRoyaltyEarned, 0);
    });
  });

  describe('tickets: creation + AI triage', () => {
    it('creates a ticket immediately and triages it in the background', async () => {
      const res = await createTicket(priya);
      assert.equal(res.status, 201);
      assert.equal(res.body.status, 'Open');
      assert.equal(res.body.priority, undefined, 'authors never see triage fields');

      const detail = await api.get(`/api/v1/admin/tickets/${res.body.id}`).set(as(admin));
      assert.equal(detail.body.ticket.category, 'Royalty & Payments');
      assert.equal(detail.body.ticket.categorySource, 'ai');
      assert.equal(detail.body.ticket.priority, 'High');
      assert.equal(detail.body.ticket.aiStatus, 'done');
    });

    it('accepts a General / Account Level ticket (no book)', async () => {
      const res = await createTicket(priya, { bookId: 'general' });
      assert.equal(res.status, 201);
      assert.equal(res.body.book, null);
    });

    it("rejects a ticket about someone else's book", async () => {
      const res = await createTicket(priya, { bookId: 'BK003' });
      assert.equal(res.status, 422);
      assert.equal(res.body.error.details[0].path, 'bookId');
    });

    it('validates subject and description', async () => {
      const res = await createTicket(priya, { subject: 'a', description: 'short' });
      assert.equal(res.status, 422);
      assert.equal(res.body.error.details.length, 2);
    });

    it('accepts attachments (multipart) and serves them only to the owner and admins', async () => {
      const res = await api.post('/api/v1/tickets').set(as(priya))
        .field('subject', 'Misprint in my copies').field('description', 'Several pages are misaligned, photo attached.').field('bookId', 'BK001')
        .attach('attachments', Buffer.from('fake image bytes'), { filename: 'photo.png', contentType: 'image/png' });
      assert.equal(res.status, 201);
      const detail = await api.get(`/api/v1/tickets/${res.body.id}`).set(as(priya));
      assert.equal(detail.body.attachments.length, 1);
      const attId = detail.body.attachments[0].id;
      assert.equal((await api.get(`/api/v1/tickets/${res.body.id}/attachments/${attId}`).set(as(priya))).status, 200);
      assert.equal((await api.get(`/api/v1/tickets/${res.body.id}/attachments/${attId}`).set(as(admin))).status, 200);
      assert.equal((await api.get(`/api/v1/tickets/${res.body.id}/attachments/${attId}`).set(as(rohit))).status, 404);
    });

    it('rejects disallowed attachment types', async () => {
      const res = await api.post('/api/v1/tickets').set(as(priya))
        .field('subject', 'Script upload').field('description', 'Trying to upload an executable file.')
        .attach('attachments', Buffer.from('MZ'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
      assert.equal(res.status, 422);
    });
  });

  describe('role-based access control', () => {
    it("does not let an author read, reply to or close another author's ticket", async () => {
      const t = (await createTicket(priya)).body;
      for (const [method, url] of [['get', `/api/v1/tickets/${t.id}`], ['post', `/api/v1/tickets/${t.id}/messages`], ['post', `/api/v1/tickets/${t.id}/close`]]) {
        const res = await api[method](url).set(as(rohit)).send({ body: 'hi' });
        assert.equal(res.status, 404, `${method} ${url}`);
      }
    });

    it("lists only the author's own tickets", async () => {
      await createTicket(rohit, { bookId: 'BK003' });
      const res = await api.get('/api/v1/tickets').set(as(rohit));
      assert.ok(res.body.items.length >= 1);
      assert.ok(res.body.items.every((t) => t.book?.bookId === 'BK003' || t.book === null));
    });

    it('blocks authors from every admin endpoint (403)', async () => {
      for (const url of ['/api/v1/admin/tickets', '/api/v1/admin/stats', '/api/v1/admin/ai/usage', '/api/v1/admin/admins']) {
        assert.equal((await api.get(url).set(as(priya))).status, 403, url);
      }
    });

    it('blocks admins from author-only endpoints', async () => {
      assert.equal((await api.get('/api/v1/tickets').set(as(admin))).status, 403);
    });

    it('returns a JSON 404 for unknown routes and a 400 for malformed JSON', async () => {
      const nf = await api.get('/api/v1/nope').set(as(admin));
      assert.equal(nf.status, 404);
      assert.equal(nf.body.error.code, 'NOT_FOUND');
      const bad = await api.post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{oops');
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error.code, 'INVALID_JSON');
    });
  });

  describe('admin ticket management', () => {
    it('supports reply, status, internal notes (hidden from author) and assignment', async () => {
      const t = (await createTicket(priya)).body;

      const note = await api.post(`/api/v1/admin/tickets/${t.id}/notes`).set(as(admin)).send({ body: 'Finance confirmed: bank details missing.' });
      assert.equal(note.status, 201);

      const reply = await api.post(`/api/v1/admin/tickets/${t.id}/messages`).set(as(admin)).send({ body: 'Hi Priya, we are on it.', aiAssisted: true });
      assert.equal(reply.status, 201);
      assert.equal(reply.body.ticket.status, 'In Progress');
      assert.equal(reply.body.ticket.assignedTo.name.startsWith('Riya'), true, 'first reply auto-assigns');
      assert.ok(reply.body.ticket.firstResponseAt);

      const authorView = await api.get(`/api/v1/tickets/${t.id}`).set(as(priya));
      assert.equal(authorView.body.messages.length, 1);
      assert.equal(authorView.body.messages[0].senderRole, 'admin');
      assert.ok(!JSON.stringify(authorView.body).includes('bank details missing'), 'internal note must never reach the author');
      assert.equal(authorView.body.ticket.awaitingYourReply, true);
    });

    it('lets admins override category and priority; overrides are audited and not overwritten by late AI', async () => {
      const t = (await createTicket(priya)).body;
      const patch = await api.patch(`/api/v1/admin/tickets/${t.id}`).set(as(admin)).send({ category: 'General Inquiry', priority: 'Low' });
      assert.equal(patch.body.ticket.category, 'General Inquiry');
      assert.equal(patch.body.ticket.categorySource, 'admin');
      assert.equal(patch.body.ticket.prioritySource, 'admin');
      assert.ok(patch.body.activity.some((a) => a.action === 'category_overridden'));

      // simulate a slow AI result landing after the override
      await ctx.container.tickets.runTriage(t.id);
      const after = await api.get(`/api/v1/admin/tickets/${t.id}`).set(as(admin));
      assert.equal(after.body.ticket.category, 'General Inquiry');
      assert.equal(after.body.ticket.priority, 'Low');
    });

    it('rejects invalid updates with 422', async () => {
      const t = (await createTicket(priya)).body;
      const res = await api.patch(`/api/v1/admin/tickets/${t.id}`).set(as(admin)).send({ priority: 'Urgent!!' });
      assert.equal(res.status, 422);
      const empty = await api.patch(`/api/v1/admin/tickets/${t.id}`).set(as(admin)).send({});
      assert.equal(empty.status, 422);
    });

    it('assigns to me and unassigns', async () => {
      const t = (await createTicket(priya)).body;
      const mine = await api.patch(`/api/v1/admin/tickets/${t.id}`).set(as(admin)).send({ assignedTo: 'me' });
      assert.ok(mine.body.ticket.assignedTo);
      const none = await api.patch(`/api/v1/admin/tickets/${t.id}`).set(as(admin)).send({ assignedTo: null });
      assert.equal(none.body.ticket.assignedTo, null);
    });

    it('reopens a resolved ticket when the author replies, and refuses replies on closed tickets', async () => {
      const t = (await createTicket(priya)).body;
      await api.post(`/api/v1/admin/tickets/${t.id}/messages`).set(as(admin)).send({ body: 'Fixed.', setStatus: 'Resolved' });
      const back = await api.post(`/api/v1/tickets/${t.id}/messages`).set(as(priya)).send({ body: 'Actually it is still wrong.' });
      assert.equal(back.body.ticket.status, 'Open');
      const closed = await api.post(`/api/v1/tickets/${t.id}/close`).set(as(priya));
      assert.equal(closed.body.ticket.status, 'Closed');
      const again = await api.post(`/api/v1/tickets/${t.id}/messages`).set(as(priya)).send({ body: 'hello?' });
      assert.equal(again.status, 409);
    });

    it('filters, sorts by urgency and searches the queue', async () => {
      const urgent = (await createTicket(priya, { subject: 'Zebra urgent', description: 'Critical zebra issue with my book right now.' })).body;
      await api.patch(`/api/v1/admin/tickets/${urgent.id}`).set(as(admin)).send({ priority: 'Critical' });

      const queue = await api.get('/api/v1/admin/tickets?status=Open,In%20Progress').set(as(admin));
      assert.equal(queue.body.items[0].priority, 'Critical', 'Critical tickets sort first');

      const search = await api.get('/api/v1/admin/tickets?q=zebra').set(as(admin));
      assert.equal(search.body.items.length, 1);
      const byCat = await api.get('/api/v1/admin/tickets?category=Printing%20%26%20Quality').set(as(admin));
      assert.ok(byCat.body.items.every((i) => i.category === 'Printing & Quality'));
      const bad = await api.get('/api/v1/admin/tickets?priority=Nope').set(as(admin));
      assert.equal(bad.status, 422);
    });

    it('treats SQL metacharacters in search as plain text', async () => {
      const res = await api.get(`/api/v1/admin/tickets?q=${encodeURIComponent("' OR 1=1 --")}`).set(as(admin));
      assert.equal(res.status, 200);
      assert.equal(res.body.items.length, 0);
    });

    it('serves dashboard stats and the admin list', async () => {
      const stats = await api.get('/api/v1/admin/stats').set(as(admin));
      assert.ok(stats.body.totalOpen >= 1);
      assert.ok('overdue' in stats.body);
      const admins = await api.get('/api/v1/admin/admins').set(as(admin));
      assert.equal(admins.body.items.length, 2);
    });
  });
});
