import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import './helpers.js'; // sets test env first
import { createDatabase } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';
import { DEV_DEFAULTS, resolveSeedPolicy } from '../src/db/seedPolicy.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bookleaf-seedpolicy-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('seed policy (pure function of the environment)', () => {
  it('development: seeding is on by default with the documented demo-only passwords', () => {
    const p = resolveSeedPolicy({ NODE_ENV: 'development' });
    assert.equal(p.enabled, true);
    assert.equal(p.authorPassword, DEV_DEFAULTS.authorPassword);
    assert.equal(p.adminPassword, DEV_DEFAULTS.adminPassword);
    assert.equal(resolveSeedPolicy({}).enabled, true, 'unset NODE_ENV behaves like development');
    assert.equal(resolveSeedPolicy({ NODE_ENV: 'test' }).enabled, true);
  });

  it('development: SEED_DEMO_DATA=false switches seeding off; env passwords override defaults', () => {
    assert.equal(resolveSeedPolicy({ NODE_ENV: 'development', SEED_DEMO_DATA: 'false' }).enabled, false);
    const p = resolveSeedPolicy({ NODE_ENV: 'development', SEED_AUTHOR_PASSWORD: 'dev-author-pw', SEED_ADMIN_PASSWORD: 'dev-admin-pw' });
    assert.equal(p.authorPassword, 'dev-author-pw');
    assert.equal(p.adminPassword, 'dev-admin-pw');
  });

  it('production: seeding is DISABLED by default, even if passwords are present', () => {
    assert.equal(resolveSeedPolicy({ NODE_ENV: 'production' }).enabled, false);
    assert.equal(resolveSeedPolicy({ NODE_ENV: 'production', SEED_AUTHOR_PASSWORD: 'x'.repeat(12), SEED_ADMIN_PASSWORD: 'y'.repeat(12) }).enabled, false);
    assert.equal(resolveSeedPolicy({ NODE_ENV: 'production', SEED_DEMO_DATA: 'false' }).enabled, false);
    assert.match(resolveSeedPolicy({ NODE_ENV: 'production' }).reason, /disabled in production/);
  });

  it('production + SEED_DEMO_DATA=true but a password missing/short -> throws (no fallback password)', () => {
    assert.throws(() => resolveSeedPolicy({ NODE_ENV: 'production', SEED_DEMO_DATA: 'true' }), /SEED_AUTHOR_PASSWORD and SEED_ADMIN_PASSWORD/);
    assert.throws(() => resolveSeedPolicy({ NODE_ENV: 'production', SEED_DEMO_DATA: 'true', SEED_AUTHOR_PASSWORD: 'long-enough-pw' }), /SEED_ADMIN_PASSWORD/);
    assert.throws(() => resolveSeedPolicy({ NODE_ENV: 'production', SEED_DEMO_DATA: 'true', SEED_AUTHOR_PASSWORD: 'short', SEED_ADMIN_PASSWORD: 'long-enough-pw' }), /SEED_AUTHOR_PASSWORD/);
  });

  it('production + explicit opt-in with both passwords -> enabled with exactly those passwords', () => {
    const p = resolveSeedPolicy({ NODE_ENV: 'production', SEED_DEMO_DATA: 'true', SEED_AUTHOR_PASSWORD: 'eval-author-pw-1', SEED_ADMIN_PASSWORD: 'eval-admin-pw-1' });
    assert.deepEqual([p.enabled, p.authorPassword, p.adminPassword], [true, 'eval-author-pw-1', 'eval-admin-pw-1']);
  });
});

describe('seedDatabase safety + dataset preservation', () => {
  it('refuses to create accounts without explicit passwords', () => {
    const db = createDatabase(':memory:');
    assert.throws(() => seedDatabase(db, { authorPassword: '', adminPassword: 'x'.repeat(10) }), /explicit author and admin passwords/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 0);
  });

  it('still seeds the original 10 authors / 18 books / 2 admins (+5 demo tickets) in development', () => {
    const db = createDatabase(':memory:');
    assert.equal(seedDatabase(db).seeded, true);
    const n = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
    assert.deepEqual([n('authors'), n('books'), n('tickets')], [10, 18, 5]);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n, 2);
  });

  it('explicit passwords are the ones that get hashed (default demo password does NOT work)', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const db = createDatabase(':memory:');
    seedDatabase(db, { authorPassword: 'custom-author-pw', adminPassword: 'custom-admin-pw', withDemoTickets: false });
    const admin = db.prepare("SELECT password_hash h FROM users WHERE email='admin@bookleaf.com'").get().h;
    assert.equal(bcrypt.compareSync('custom-admin-pw', admin), true);
    assert.equal(bcrypt.compareSync('Admin@123', admin), false);
  });
});

// ---- real server processes, real start-up path, temp databases only ----
let nextPort = 4450 + Math.floor(Math.random() * 100);
function startServer(extraEnv) {
  const dbPath = path.join(tmp, `db-${nextPort}.sqlite`);
  const port = nextPort++;
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: serverRoot,
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, NODE_ENV: 'production', JWT_SECRET: 'test-only-secret-not-real', DATABASE_PATH: dbPath, UPLOAD_DIR: path.join(tmp, `up-${port}`), PORT: String(port), OPENAI_API_KEY: '', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const ready = (async () => {
    for (let i = 0; i < 60; i += 1) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/v1/health`)).ok) return true; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  })();
  const login = (email, password) => fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then((r) => r.status);
  return { child, ready, exited, login, dbPath, getOutput: () => output, stop: async () => { child.kill(); await exited; } };
}

describe('production start-up path (child processes, temp DBs)', () => {
  it('production default: starts, seeds NOTHING, known demo accounts cannot sign in', async () => {
    const s = startServer({});
    try {
      assert.equal(await s.ready, true, s.getOutput());
      assert.equal(await s.login('admin@bookleaf.com', 'Admin@123'), 401);
      assert.equal(await s.login('priya.sharma@email.com', 'Author@123'), 401);
      assert.match(s.getOutput(), /Demo seeding is disabled in production/);
    } finally { await s.stop(); }
    const db = new Database(s.dbPath, { readonly: true });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM books').get().n, 0);
    db.close();
  });

  it('production + SEED_DEMO_DATA=true without passwords: refuses to start, nothing created', async () => {
    const s = startServer({ SEED_DEMO_DATA: 'true' });
    const code = await s.exited;
    assert.notEqual(code, 0);
    assert.match(s.getOutput(), /SEED_AUTHOR_PASSWORD and SEED_ADMIN_PASSWORD/);
    let users = 0;
    if (fs.existsSync(s.dbPath)) {
      const db = new Database(s.dbPath, { readonly: true });
      users = db.prepare('SELECT COUNT(*) n FROM users').get().n;
      db.close();
    }
    assert.equal(users, 0, 'no accounts may exist after a refused start');
  });

  it('production + explicit opt-in: seeds the dataset with ONLY the supplied passwords', async () => {
    const s = startServer({ SEED_DEMO_DATA: 'true', SEED_AUTHOR_PASSWORD: 'eval-author-pw-9', SEED_ADMIN_PASSWORD: 'eval-admin-pw-9' });
    try {
      assert.equal(await s.ready, true, s.getOutput());
      assert.equal(await s.login('admin@bookleaf.com', 'eval-admin-pw-9'), 200);
      assert.equal(await s.login('priya.sharma@email.com', 'eval-author-pw-9'), 200);
      assert.equal(await s.login('admin@bookleaf.com', 'Admin@123'), 401, 'the well-known default must not work');
      assert.equal(await s.login('priya.sharma@email.com', 'Author@123'), 401);
    } finally { await s.stop(); }
    const db = new Database(s.dbPath, { readonly: true });
    assert.deepEqual([db.prepare('SELECT COUNT(*) n FROM authors').get().n, db.prepare('SELECT COUNT(*) n FROM books').get().n], [10, 18]);
    db.close();
  });
});
