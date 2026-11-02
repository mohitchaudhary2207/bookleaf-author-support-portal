// Opt-in browser check of the redesigned UI (NOT part of npm test; needs a browser, so it is not a dependency).
//
//   1. Run an ISOLATED server on a temp database (never your real one), e.g.
//        DATABASE_PATH=/tmp/ui.db UPLOAD_DIR=/tmp/ui-up PORT=4100 node server/src/index.js
//        VITE_API_TARGET=http://localhost:4100 npx vite --port 5174 --strictPort   (from client/)
//   2. npm install --no-save playwright-core     (kept out of package.json on purpose)
//   3. BROWSER_PATH=<path to Edge/Chrome> node scripts/ui-check.mjs docs/screenshots [--live-ai]
//
// It signs in with the demo accounts, screenshots every screen at desktop/tablet/mobile widths, asserts no horizontal
// overflow, and records every request to the AI draft endpoints to prove that opening a ticket makes none.
// --live-ai additionally clicks "Generate AI Response" once (one real model call) and walks the edit/send flow.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5174';
const OUT = process.argv[2] ?? './shots';
const LIVE_AI = process.argv.includes('--live-ai');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH, headless: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`); };

async function session(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const draftCalls = [];
  const consoleErrors = [];
  page.on('request', (r) => { if (/\/admin\/tickets\/\d+\/draft/.test(r.url())) draftCalls.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/401/.test(m.text())) consoleErrors.push(m.text()); }); // 401 = the expected signed-out session probe
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  return { ctx, page, draftCalls, consoleErrors };
}
const shot = async (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
const full = async (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button.btn-primary.btn-block');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const sizes = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1100 }, mobile: { width: 390, height: 844 } };

for (const [label, viewport] of Object.entries(sizes)) {
  // ---------------- login page ----------------
  {
    const { ctx, page } = await session(viewport);
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('#email');
    await shot(page, `${label}-01-login`);
    check(`${label}: login page has no horizontal overflow`, !(await overflow(page)));
    // validation + password toggle
    await page.click('button.btn-primary.btn-block');
    check(`${label}: login shows validation errors`, (await page.locator('.field-error').count()) === 2);
    await page.fill('#password', 'secret');
    await page.click('button[aria-label="Show password"]');
    check(`${label}: password visibility toggle works`, (await page.getAttribute('#password', 'type')) === 'text');
    await ctx.close();
  }

  // ---------------- author ----------------
  {
    const { ctx, page, consoleErrors } = await session(viewport);
    await login(page, 'priya.sharma@email.com', 'Author@123');
    await page.waitForSelector('.stat');
    await page.waitForTimeout(400);
    check(`${label}: author lands on dashboard`, new URL(page.url()).pathname === '/dashboard');
    await shot(page, `${label}-02-author-dashboard`);
    check(`${label}: author dashboard no overflow`, !(await overflow(page)));
    const stats = await page.$$eval('.stat .stat-label', (els) => els.map((e) => e.textContent));
    check(`${label}: author dashboard stats present`, ['Total books', 'Published', 'In production', 'Royalties earned', 'Royalties paid', 'Pending royalties', 'Active tickets'].every((s) => stats.includes(s)), stats.join(', '));

    await page.goto(`${BASE}/books`); await page.waitForSelector('.book');
    await shot(page, `${label}-03-author-books`);
    check(`${label}: books no overflow`, !(await overflow(page)));

    await page.goto(`${BASE}/tickets`); await page.waitForSelector('.ticket-row, .empty');
    await shot(page, `${label}-04-author-tickets`);
    check(`${label}: my tickets no overflow`, !(await overflow(page)));

    await page.goto(`${BASE}/tickets/new`); await page.waitForSelector('#subject');
    await shot(page, `${label}-05-author-new-ticket`);
    check(`${label}: new ticket no overflow`, !(await overflow(page)));

    // a ticket detail (first one, if any)
    await page.goto(`${BASE}/tickets`); await page.waitForSelector('.ticket-row, .empty');
    if (await page.locator('.ticket-row').count()) {
      await page.locator('.ticket-row').first().click();
      await page.waitForSelector('.thread');
      await shot(page, `${label}-06-author-ticket-detail`);
      check(`${label}: author ticket detail no overflow`, !(await overflow(page)));
      const html = await page.content();
      check(`${label}: author view never shows internal notes / AI triage`, !/Internal notes|AI classification|Generate AI Response/.test(html));
    }
    check(`${label}: author flow has no console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ---------------- author ticket detail (Ananya has a seeded ticket) ----------------
  {
    const { ctx, page } = await session(viewport);
    await login(page, 'ananya.reddy@email.com', 'Author@123');
    await page.goto(`${BASE}/tickets`); await page.waitForSelector('.ticket-row');
    await shot(page, `${label}-04b-author-tickets-list`);
    await page.locator('.ticket-row').first().click();
    await page.waitForSelector('.thread'); await page.waitForTimeout(300);
    await shot(page, `${label}-06b-author-ticket-detail`);
    check(`${label}: author ticket detail (with a ticket) no overflow`, !(await overflow(page)));
    const html = await page.content();
    check(`${label}: author view of a ticket never shows internal notes / AI triage`, !/Internal notes|AI classification|Generate AI Response/.test(html));
    await ctx.close();
  }

  // ---------------- production tracker (Sneha has a book in cover design) ----------------
  {
    const { ctx, page } = await session(viewport);
    await login(page, 'sneha.kulkarni@email.com', 'Author@123');
    await page.goto(`${BASE}/books`); await page.waitForSelector('.stages');
    const stagesBox = await page.locator('.stages').first().boundingBox();
    const cardBox = await page.locator('.book:has(.stages)').first().boundingBox();
    check(`${label}: production tracker stays inside its card`, stagesBox.x >= cardBox.x - 1 && stagesBox.x + stagesBox.width <= cardBox.x + cardBox.width + 1, `stages ${Math.round(stagesBox.width)}px in card ${Math.round(cardBox.width)}px`);
    check(`${label}: books page (production) no overflow`, !(await overflow(page)));
    await page.locator('.book:has(.stages)').first().screenshot({ path: path.join(OUT, `${label}-07-production-tracker.png`) });
    await ctx.close();
  }
}

// ---------------- admin (desktop + mobile) ----------------
for (const [label, viewport] of [['desktop', sizes.desktop], ['tablet', sizes.tablet], ['mobile', sizes.mobile]]) {
  const { ctx, page, draftCalls, consoleErrors } = await session(viewport);
  await login(page, 'admin@bookleaf.com', 'Admin@123');
  await page.waitForSelector('.stat'); await page.waitForTimeout(500);
  check(`${label}: admin lands on dashboard`, new URL(page.url()).pathname === '/admin/dashboard');
  await shot(page, `${label}-10-admin-dashboard`);
  check(`${label}: admin dashboard no overflow`, !(await overflow(page)));

  await page.goto(`${BASE}/admin`); await page.waitForSelector('.queue tbody tr');
  await page.waitForTimeout(300);
  await shot(page, `${label}-11-admin-queue`); if (label === 'mobile') await full(page, 'mobile-11b-admin-queue-cards');
  check(`${label}: queue no overflow`, !(await overflow(page)));
  const rows = await page.locator('.queue tbody tr').count();
  check(`${label}: queue lists tickets`, rows > 0, `${rows} rows`);
  if (label === 'desktop') check('desktop: queue table fits without sideways scrolling', await page.$eval('.table-wrap', (e) => e.scrollWidth <= e.clientWidth + 1));
  if (label === 'desktop') { await page.click('.appbar-collapse'); await page.waitForTimeout(350); await shot(page, 'desktop-18-sidebar-collapsed'); await page.click('.appbar-collapse'); await page.waitForTimeout(350); }
  if (label === 'mobile') { await page.click('.appbar-menu'); await page.waitForTimeout(350); await shot(page, 'mobile-18-drawer-open'); await page.keyboard.press('Escape'); await page.waitForTimeout(300); check('mobile: Esc closes the menu drawer', !(await page.locator('.sidebar.is-open').count())); }

  // ---- open a ticket: must produce ZERO draft requests ----
  if (label === 'desktop') await page.locator('.queue tbody tr').first().click(); else { await page.locator('.queue tbody tr').nth(1).click(); }
  await page.waitForSelector('.workspace'); await page.waitForTimeout(1200);
  const opened = draftCalls.slice();
  check(`${label}: opening a ticket makes no POST (generation) request`, !opened.some((c) => c.startsWith('POST')), JSON.stringify(opened));
  check(`${label}: opening a ticket shows the Generate AI Response button`, (await page.locator('button:has-text("Generate AI Response")').count()) === 1);
  check(`${label}: editor starts empty (no auto-draft)`, (await page.inputValue('#reply-text')) === '');
  await shot(page, `${label}-12-admin-ticket-empty-ai`);
  check(`${label}: admin ticket no overflow`, !(await overflow(page)));
  await full(page, `${label}-12b-admin-ticket-full`);

  if (label === 'desktop') {
    // reopen twice more: still no generation
    const url = page.url();
    for (let i = 0; i < 2; i += 1) { await page.goto(`${BASE}/admin`); await page.waitForSelector('.queue tbody tr'); await page.goto(url); await page.waitForSelector('.workspace'); await page.waitForTimeout(600); }
    check('desktop: reopening the ticket twice still makes no POST', !draftCalls.some((c) => c.startsWith('POST')), JSON.stringify(draftCalls));

    // internal note, then explicit generate
    await page.fill('textarea[aria-label="Internal note"]', 'E2E note: confirm bank details with Finance.');
    await page.click('button:has-text("Add note")');
    await page.waitForSelector('.notes li:has-text("E2E note")');
    check('desktop: internal note added and visible to admin', true);

    if (LIVE_AI) {
      const before = draftCalls.filter((c) => c.startsWith('POST')).length;
      await page.click('button:has-text("Generate AI Response")');
      await page.waitForSelector('.ai-generating');
      await shot(page, 'desktop-13-ai-generating');
      check('desktop: button disabled while generating', await page.locator('.ai-generating button[disabled]').count() === 1);
      await page.waitForSelector('.ai-ready', { timeout: 60000 });
      const posts = draftCalls.filter((c) => c.startsWith('POST')).length - before;
      check('desktop: clicking Generate sends exactly one POST', posts === 1, `posts=${posts}`);
      const draftText = await page.inputValue('#reply-text');
      check('desktop: generated draft placed in the editor', draftText.length > 40, `${draftText.length} chars`);
      await shot(page, 'desktop-14-ai-draft-ready');
      // edit it
      await page.fill('#reply-text', `${draftText}\n\nP.S. Edited by the admin.`);
      check('desktop: draft stays editable', (await page.inputValue('#reply-text')).endsWith('Edited by the admin.'));
      check('desktop: label switches to edited', (await page.locator('.composer-label .badge').textContent()).includes('edited'));
      await shot(page, 'desktop-15-ai-draft-edited');
      // nothing sent yet
      const sentBefore = await page.locator('.bubble-row.from-admin').count();
      // reload ticket: saved draft shown from storage, no new POST
      const url2 = page.url();
      await page.goto('about:blank'); await page.goto(url2); await page.waitForSelector('.workspace'); await page.waitForSelector('.ai-ready'); await page.waitForTimeout(500);
      check('desktop: saved draft shown on reopen without regeneration', draftCalls.filter((c) => c.startsWith('POST')).length - before === 1 && (await page.inputValue('#reply-text')).length > 40);
      check('desktop: nothing was sent until Send is clicked', (await page.locator('.bubble-row.from-admin').count()) === sentBefore);
      await page.click('button:has-text("Send reply")');
      await page.waitForFunction((n) => document.querySelectorAll('.bubble-row.from-admin').length === n + 1, sentBefore, { timeout: 15000 });
      check('desktop: Send reply posts the message', true);
      await shot(page, 'desktop-16-after-send');
    }
  }
  check(`${label}: admin flow has no unexpected console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await page.goto(`${BASE}/admin/ai`); await page.waitForSelector('.stat');
  await shot(page, `${label}-17-admin-ai-usage`);
  check(`${label}: AI usage no overflow`, !(await overflow(page)));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
