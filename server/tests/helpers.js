// Must run before any app module is imported: config reads the environment at import time.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bookleaf-uploads-'));
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { createContainer } = await import('../src/container.js');
const { createDatabase } = await import('../src/db/index.js');
const { seedDatabase } = await import('../src/db/seed.js');
const { AIError } = await import('../src/services/ai/aiError.js');
const { config } = await import('../src/config/index.js');
const { default: request } = await import('supertest');

export { AIError, config };

/** Fake LLM provider: records calls, can be switched into a failing state to simulate an outage. */
export function createFakeProvider() {
  const fake = {
    name: 'fake',
    model: 'fake-model',
    calls: [],
    failWith: null,
    delayMs: 0,
    replyQueue: [], // optional: successive draft replies (consumed first) to script retry / quality-gate scenarios
    classification: { category: 'Royalty & Payments', priority: 'High', confidence: 0.92, rationale: 'Author reports missing royalty.' },
    reply: 'Hi Priya,\n\nThank you for flagging this. Here is exactly where things stand and what happens next.\n\nWarm regards,\nRiya Mehta\nBookLeaf Support',
    async callTool({ system, user, tool }) {
      fake.calls.push({ tool: tool.name, system, user });
      if (fake.delayMs) await new Promise((r) => setTimeout(r, fake.delayMs));
      if (fake.failWith) throw fake.failWith;
      const usage = { inputTokens: 100, outputTokens: 40, cacheReadTokens: 0 };
      if (tool.name === 'classify_ticket') return { input: fake.classification, usage, model: 'fake-model' };
      return { input: { reply: fake.replyQueue.length ? fake.replyQueue.shift() : fake.reply, admin_notes: ['Check bank details'] }, usage, model: 'fake-model' };
    },
  };
  return fake;
}

/** Fresh in-memory app + seeded data per test file. */
export function buildApp({ provider = createFakeProvider(), demoTickets = false } = {}) {
  const db = createDatabase(':memory:');
  seedDatabase(db, { withDemoTickets: demoTickets });
  const container = createContainer({ db, aiProvider: provider });
  const app = createApp(container);
  return { app, container, db, provider, request: () => request(app) };
}

export async function login(api, email, password) {
  const res = await api.post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

export const as = (token) => ({ Authorization: `Bearer ${token}` });
export const AUTHOR_PASSWORD = config.seed.authorPassword;
export const ADMIN_PASSWORD = config.seed.adminPassword;
