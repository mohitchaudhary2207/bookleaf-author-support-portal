// Regression tests for the three mutants that survived the audit's mutation testing:
//   M4  - SSE delivers another author's events            -> "cross-author SSE isolation"
//   M14 - admin can reply to a Closed ticket              -> "closed-ticket admin reply"
//   M17 - LIKE wildcard escaping removed from search      -> "literal % and _ in search"
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { ADMIN_PASSWORD, AUTHOR_PASSWORD, as, buildApp, login } from './helpers.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open an SSE stream and collect everything received. */
function openStream(port, token) {
  const chunks = [];
  const req = http.get({ port, path: '/api/v1/events', headers: { Authorization: `Bearer ${token}` } }, (res) => {
    res.setEncoding('utf8');
    res.on('data', (c) => chunks.push(c));
  });
  return { text: () => chunks.join(''), close: () => req.destroy() };
}
const eventNames = (text) => [...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);

describe('SSE: an author never receives another author\'s ticket events', () => {
  let ctx; let api; let server; let priya; let rohit; let admin;
  before(async () => {
    ctx = buildApp();
    api = ctx.request();
    server = ctx.app.listen(0);
    priya = await login(api, 'priya.sharma@email.com', AUTHOR_PASSWORD);
    rohit = await login(api, 'rohit.kapoor@email.com', AUTHOR_PASSWORD);
    admin = await login(api, 'admin@bookleaf.com', ADMIN_PASSWORD);
  });
  after(() => { server.close(); ctx.container.close(); });

  it('two independently authenticated streams: A gets her own events, B gets none of them (and vice versa)', async () => {
    const { port } = server.address();
    const sPriya = openStream(port, priya);
    const sRohit = openStream(port, rohit);
    const sAdmin = openStream(port, admin);
    try {
      await sleep(250);
      const tPriya = (await api.post('/api/v1/tickets').set(as(priya)).send({ bookId: 'BK001', subject: 'Priya private ticket', description: 'This ticket belongs to Priya Sharma only.' })).body;
      const tRohit = (await api.post('/api/v1/tickets').set(as(rohit)).send({ bookId: 'BK003', subject: 'Rohit private ticket', description: 'This ticket belongs to Rohit Kapoor only.' })).body;
      await ctx.container.tickets.whenIdle();
      await api.post(`/api/v1/admin/tickets/${tPriya.id}/messages`).set(as(admin)).send({ body: 'Hi Priya, a reply that only Priya may be told about.' });
      await api.post(`/api/v1/admin/tickets/${tRohit.id}/messages`).set(as(admin)).send({ body: 'Hi Rohit, a reply that only Rohit may be told about.' });
      await api.patch(`/api/v1/admin/tickets/${tPriya.id}`).set(as(admin)).send({ status: 'Resolved' });
      await sleep(400);

      const p = sPriya.text(); const r = sRohit.text(); const a = sAdmin.text();
      // each author sees events for their own ticket ...
      assert.ok(p.includes(`"ticketId":${tPriya.id}`), 'Priya receives her own ticket events');
      assert.ok(r.includes(`"ticketId":${tRohit.id}`), 'Rohit receives his own ticket events');
      assert.ok(eventNames(p).includes('ticket.message') && eventNames(r).includes('ticket.message'));
      // ... and NEVER the other author's
      assert.ok(!p.includes(`"ticketId":${tRohit.id}`), "Priya must not receive Rohit's ticket events");
      assert.ok(!r.includes(`"ticketId":${tPriya.id}`), "Rohit must not receive Priya's ticket events");
      assert.ok(!p.includes('"authorId":"AUTH002"'), 'no foreign author id in Priya\'s stream');
      assert.ok(!r.includes('"authorId":"AUTH001"'), 'no foreign author id in Rohit\'s stream');
      // admin-only event types never reach either author
      for (const text of [p, r]) assert.ok(!/ticket\.(note|triaged)/.test(text));
      // the admin stream sees both tickets
      assert.ok(a.includes(`"ticketId":${tPriya.id}`) && a.includes(`"ticketId":${tRohit.id}`));
    } finally { sPriya.close(); sRohit.close(); sAdmin.close(); }
  });
});

describe('closed tickets cannot receive admin replies', () => {
  it('admin reply on a Closed ticket -> 409 CONFLICT, nothing is stored, nothing is broadcast; reopening restores replies', async () => {
    const ctx = buildApp();
    const api = ctx.request();
    const priya = await login(api, 'priya.sharma@email.com', AUTHOR_PASSWORD);
    const admin = await login(api, 'admin@bookleaf.com', ADMIN_PASSWORD);
    try {
      const t = (await api.post('/api/v1/tickets').set(as(priya)).send({ bookId: 'BK001', subject: 'Close me', description: 'A ticket that will be closed by an admin.' })).body;
      await ctx.container.tickets.whenIdle();
      await api.patch(`/api/v1/admin/tickets/${t.id}`).set(as(admin)).send({ status: 'Closed' });

      const reply = await api.post(`/api/v1/admin/tickets/${t.id}/messages`).set(as(admin)).send({ body: 'Hi Priya, this must not be accepted.' });
      assert.equal(reply.status, 409);
      assert.equal(reply.body.error.code, 'CONFLICT');
      assert.match(reply.body.error.message, /closed/i);

      const detail = (await api.get(`/api/v1/admin/tickets/${t.id}`).set(as(admin))).body;
      assert.equal(detail.messages.length, 0, 'the rejected reply was not stored');
      assert.equal(detail.ticket.status, 'Closed');
      assert.equal((await api.get(`/api/v1/tickets/${t.id}`).set(as(priya))).body.messages.length, 0, 'author sees nothing');
      assert.equal((await api.get(`/api/v1/admin/tickets/${t.id}/draft`).set(as(admin))).status, 409, 'no draft for a closed ticket either');

      // an explicit reopen is the supported path
      await api.patch(`/api/v1/admin/tickets/${t.id}`).set(as(admin)).send({ status: 'Open' });
      const ok = await api.post(`/api/v1/admin/tickets/${t.id}/messages`).set(as(admin)).send({ body: 'Hi Priya, reopened and answered.' });
      assert.equal(ok.status, 201);
    } finally { ctx.container.close(); }
  });
});

describe('admin search treats % and _ literally (no SQL LIKE wildcard injection)', () => {
  let ctx; let api; let priya; let admin;
  before(async () => {
    ctx = buildApp();
    api = ctx.request();
    priya = await login(api, 'priya.sharma@email.com', AUTHOR_PASSWORD);
    admin = await login(api, 'admin@bookleaf.com', ADMIN_PASSWORD);
    const mk = (subject) => api.post('/api/v1/tickets').set(as(priya)).send({ bookId: 'BK001', subject, description: 'Search wildcard fixture ticket description.' });
    await mk('Promo 100% off request');
    await mk('Promo 100X off request');
    await mk('Error in file_name field');
    await mk('Error in fileXname field');
    await mk('Back\\slash ticket');
    await ctx.container.tickets.whenIdle();
  });
  after(() => ctx.container.close());

  const search = async (q) => (await api.get(`/api/v1/admin/tickets?q=${encodeURIComponent(q)}`).set(as(admin))).body;
  const subjects = (body) => body.items.map((t) => t.subject).sort();

  it("'%' matches only the ticket that really contains a percent sign", async () => {
    assert.deepEqual(subjects(await search('%')), ['Promo 100% off request']);
  });

  it("'100%' is a literal: it must not behave like the wildcard '100%%' (which would also match '100X')", async () => {
    assert.deepEqual(subjects(await search('100%')), ['Promo 100% off request']);
  });

  it("'_' matches only literal underscores; 'file_name' does not match 'fileXname'", async () => {
    assert.deepEqual(subjects(await search('_')), ['Error in file_name field']);
    assert.deepEqual(subjects(await search('file_name')), ['Error in file_name field']);
  });

  it('a backslash in the search text is literal too', async () => {
    assert.deepEqual(subjects(await search('Back\\slash')), ['Back\\slash ticket']);
  });

  it('plain text search still works and wildcard-only inputs do not return the whole queue', async () => {
    assert.equal((await search('promo')).total, 2);
    assert.ok((await search('%%')).total < 5, "'%%' must not match everything");
    assert.equal((await search('___')).total, 0);
  });
});
