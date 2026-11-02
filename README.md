# BookLeaf Author Support & Communication Portal

A full-stack web app that lets BookLeaf authors raise support tickets and lets the operations team resolve them faster, with **AI-assisted triage and reply drafting** that degrades gracefully when the AI is unavailable. Built for BookLeaf Publishing's full-stack technical assignment.

- **Author portal** - email/password login, *My Books* (royalties, production progress), *Submit a query* (with optional attachments), *My Tickets* with live updates and replies.
- **Admin console** - urgency-sorted ticket queue with filters, AI category + priority (overridable), AI-drafted replies grounded in the BookLeaf knowledge base, internal notes, assignment, audit trail, SLA flags, AI usage/cost page.
- **REST API** - versioned (`/api/v1`), role-based, validated, documented with OpenAPI 3.0.3 (Swagger UI at `/api/docs`).

| | |
|---|---|
| **Live demo** | **Deployment pending - no live URL yet.** A Render blueprint and a Dockerfile are included; see [Deploy](#deploy). |
| **API docs** | `/api/docs` (Swagger UI) · `/api/openapi.json` · source: `server/src/docs/openapi.yaml` (OpenAPI 3.0.3) |
| **Stack** | Node 22 · Express 5.3 · SQLite (better-sqlite3 13) · React 19.3 + React Router 7.18 + Vite 8.3 · Zod 4.6 · Server-Sent Events · OpenAI SDK 7.47 (`gpt-4o-mini`) |

## Demo credentials (isolated evaluation environment only)

> **These credentials exist only for evaluating the seeded demo dataset** (the assignment asks for test logins). They are well-known, published passwords: never use them, or this seeding mode, for a system holding real author data. See [Demo data & production safety](#demo-data--production-safety).

When the demo dataset is seeded (always in local development; on a deployment only if explicitly enabled - see below), these accounts exist. The passwords below are the development defaults; an evaluation deployment uses whatever passwords were supplied through `SEED_AUTHOR_PASSWORD` / `SEED_ADMIN_PASSWORD`.

| Role | Email | Password (dev default) |
|---|---|---|
| Admin (support lead) | `admin@bookleaf.com` | `Admin@123` |
| Admin | `support@bookleaf.com` | `Admin@123` |
| Author (any of the 10) | `priya.sharma@email.com`, `rohit.kapoor@email.com`, `ananya.reddy@email.com`, `vikram.joshi@email.com`, `meera.nair@email.com`, `arjun.malhotra@email.com`, `sneha.kulkarni@email.com`, `farhan.sheikh@email.com`, `kavita.deshmukh@email.com`, `diya.chatterjee@email.com` | `Author@123` |

Seeded data: the provided dataset (10 authors, 18 books) plus 5 demo tickets. The login page offers a click-to-fill "Demo accounts" panel only in local development, or in a build made with `VITE_SHOW_DEMO=true`; default production builds contain no demo credentials.

Edge cases from the dataset worth trying:
- **Sneha Kulkarni** - *Midnight in Mysore* is in production (no MRP / sales; shows a progress stepper).
- **Ananya Reddy, Arjun Malhotra, Kavita Deshmukh (*The Nagpur Notebooks*), Diya Chatterjee (*Howrah Nights*)** - published and earning, but nothing paid yet (royalty-paid ₹0).
- **Kavita Deshmukh** - *The Nagpur Notebooks* has ₹850 pending, below the ₹1,000 minimum payout (rolls over); *Raising Roots* is in typesetting.
- **Farhan Sheikh, Priya's *Saffron Diaries*** and others - fully paid, ₹0 pending.

## Run locally

Requires Node 22.9+ (uses `--env-file-if-exists`).

```bash
npm install                      # installs server + client (npm workspaces)
cp .env.example server/.env      # then edit: OPENAI_API_KEY (optional), JWT_SECRET
npm run dev                      # API on :4000, web app on http://localhost:5173 (demo data seeded, demo panel on)
```

- Without `OPENAI_API_KEY` the app runs in **manual mode** (rule-based triage + template drafts) - everything still works.
- Production-style run: `npm run build && npm start` serves the API **and** the built React app from one process on `$PORT` (set `NODE_ENV=production` and `JWT_SECRET`; see the demo-data rules below).
- Reset local demo data: delete `server/storage/bookleaf.db`, or run `npm run seed -w server -- --force` (wipes and re-seeds; honours the seeding rules below).

### Scripts

| Command | What it does |
|---|---|
| `npm test` | Server test suite - 103 tests in 9 files; no network, API key or cost |
| `npm run validate:openapi` | Strict OpenAPI 3.0.3 validation of the spec |
| `npm run check:bundle` | Release gate: fails if `client/dist` contains secrets or demo credentials (`-- --allow-demo` for an opted-in demo build) |
| `npm run eval:ai` | **Opt-in, live**: runs the brief's 7 sample queries through triage + draft against OpenAI (~15 calls, well under 1 US cent). `-- --offline` evaluates the fallback path with no API calls |

### Environment variables

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM key. **Server-side only** - never sent to or bundled into the frontend. |
| `AI_MODEL` | Default `gpt-4o-mini` (cheap, fast, ideal for classification + short drafts). |
| `AI_ENABLED` | `false` forces manual mode. |
| `AI_PRICE_INPUT/OUTPUT/CACHE_READ` | USD per 1M tokens, used only for the cost estimate on the admin AI page. |
| `JWT_SECRET` | **Required in production** (the server refuses to start without it). |
| `DATABASE_PATH`, `UPLOAD_DIR` | Storage locations (default `server/storage/...`). |
| `SEED_DEMO_DATA` | Controls demo seeding. Development: on unless `false`. **Production: off unless exactly `true`.** |
| `SEED_AUTHOR_PASSWORD`, `SEED_ADMIN_PASSWORD` | Passwords for seeded accounts. Development falls back to the demo defaults; **production has no fallback** and requires both (min. 8 chars) whenever `SEED_DEMO_DATA=true`. |
| `VITE_SHOW_DEMO` | *Build-time* frontend flag. `true` adds the demo-accounts panel (embedding the demo passwords in the bundle). Default for production builds: off. |
| `CORS_ORIGINS` | Only needed if the frontend is hosted on a different origin. |

### Demo data & production safety

Seeding is decided by `server/src/db/seedPolicy.js`, applied at start-up and by `npm run seed`:

| Environment | Seeds known demo accounts? |
|---|---|
| development / test | yes, into an empty database (unless `SEED_DEMO_DATA=false`) |
| production, default | **no** - nobody can sign in until real data is loaded |
| production, `SEED_DEMO_DATA=true` | yes, **only** with `SEED_AUTHOR_PASSWORD` and `SEED_ADMIN_PASSWORD` set; otherwise the server refuses to start |

The dataset is only ever seeded into an *empty* database, never over existing data.

### Deploy

**Status: not deployed yet.** What is in place:

- `render.yaml` - Render blueprint for a single web service (API + built frontend). The build command is `npm ci --include=dev && npm run build`: Render sets `NODE_ENV=production` during the build too, which would make a plain `npm ci` skip devDependencies (Vite) and fail - this was reproduced and fixed, and the new command was verified from a clean copy. The start command is `npm start`; the health check is `GET /api/v1/health`. The blueprint is written for an **isolated evaluation deployment** (it enables demo seeding, so you must provide both seed passwords in the dashboard); remove the three `SEED_*` entries for anything else.
- `Dockerfile` - multi-stage build with the same dev-dependency rule. **Not yet built or run** (no Docker daemon was available during release work).
- Set `JWT_SECRET` (generated by the blueprint) and `OPENAI_API_KEY` in the host's dashboard, never in the repository. On free hosts the disk is ephemeral, so data re-seeds on each restart; attach a disk and set `DATABASE_PATH` / `UPLOAD_DIR` to persist.
- Before announcing a deployment, run `npm run check:bundle` against the production build.

## Architecture

```
client/  React SPA (Vite)            server/src/
  context/  auth, live (SSE), toasts   app.js            Express app: security headers, routing, error handler
  api/      fetch client + hooks       container.js      composition root (the only place concrete deps are chosen)
  pages/    author/  admin/            routes/           HTTP layer: parse -> validate -> call a service
  components/ (DemoAccounts is         schemas/          zod request schemas (single source of validation truth)
    opt-in, lazily loaded)             middleware/       auth + RBAC, CSRF origin check, validation, uploads, errors
                                       services/         ticketService (lifecycle + access rules), events (SSE hub), royalty maths
                                       services/ai/      aiService, openaiProvider, prompts, knowledgeBase, facts, quality,
                                                         rules (fallback triage), templates (fallback drafts)
                                       repositories/     SQL only (users, books, tickets, ai)
                                       db/               schema.sql, seed, seedPolicy
server/evals/   opt-in AI evaluation   server/tests/     test suite     scripts/   release gates
```

**Decisions and why**

- **Layering: routes -> services -> repositories.** All *ticket* operations - list, create, reply, close, status/override changes, notes, drafts and attachment download - go through `ticketService`, which owns the lifecycle rules (reopen on author reply, auto-assign on first reply, override protection, audit log) and the access check. Repositories contain only SQL. Honest exception: a handful of **read-only lookup routes call repositories directly** without a service in between - login/`me` (`routes/auth.js`), the book list/detail (`routes/books.js`, scoped to the signed-in author in the handler), and the admin stats / AI usage / admins / authors lookups (`routes/admin.js`). They contain no business rules.
- **Composition root.** `container.js` injects dependencies, so tests swap in an in-memory database and a fake LLM without mocking modules.
- **SQLite.** Zero-ops and transactional; the schema is what matters: `authors`, `books`, `tickets`, `ticket_messages` (public) and `ticket_notes` (internal) are **separate tables** so a bad query can never leak an internal note to an author; plus `ticket_activity` (audit), `ai_drafts` (cache), `ai_usage` (metering). Triage fields carry a `*_source` (`ai | rules | admin`) so overrides are auditable and never clobbered by a slow AI call.
- **Real time = Server-Sent Events.** Updates are one-way, ride plain HTTP (cookies, proxies), and `EventSource` auto-reconnects. Events carry **only ids**; clients re-fetch via the REST API, so ticket authorization stays in one place. The client resyncs after a reconnect. Authors only receive events for their own tickets (isolation across two simultaneous author streams is covered by a regression test); note/triage events are admin-only.
- **Auth.** bcrypt-hashed passwords; JWT delivered as an **httpOnly, SameSite=Lax cookie** (`Secure` in production; also accepted as `Authorization: Bearer` for API clients). The user is re-read from the DB per request. Cookie-authenticated writes pass an **Origin check** (CSRF). Login is rate-limited and returns the same error for unknown email and wrong password. Other authors' resources return **404, not 403**, so ids can't be probed.
- **Authorization.** `loadAccessible(user, id)` in `ticketService` guards every ticket operation, including attachment download. Book reads are scoped in the route handler; event delivery is scoped in `events.js`.
- **Validation** with zod on every input; errors are `422 { error: { code, message, details:[{path,message}] } }` and the UI maps `details` onto form fields. SQL is always parameterised; search wildcards (`%`, `_`, `\`) are escaped.
- **SLA / urgency.** The queue sorts unresolved-first, then priority (Critical>Low), then oldest-first. Each ticket has a first-response target by priority (Critical 4h, High 24h, Medium 48h, Low 72h) and is flagged **Overdue** when missed.

## How the AI integration works

**Model choice: OpenAI `gpt-4o-mini`.** The tasks are short and well-specified (classify a ticket, write ~100-150 words from supplied facts), so a small, fast, inexpensive model is the right fit: $0.15 / $0.60 per million input/output tokens, so triage + draft costs a small fraction of a cent (24 live calls measured $0.0042 on the app's own meter). It supports strict, schema-enforced function calling, which is what makes the output reliable. Swapping providers means implementing one method (`callTool`) in `services/ai/`.

### 1. Triage - one call, category **and** priority
`aiService.triage()` sends only the ticket subject/description (truncated) and a one-line summary of the referenced book - **not** the knowledge base and **not** the thread. The model must answer through a forced, **strict** function call (`classify_ticket`) with an enum-constrained category/priority, a confidence and a one-sentence rationale shown to the admin. The prompt contains a priority **rubric** (e.g. "no royalty for ~6 months on a live book" = Critical, ISBN errors = High, bio update = Low). **Policy guardrails** apply afterwards (ISBN errors are never below High). Output is validated with zod; anything invalid triggers the rule-based fallback.

### 2. Draft - grounded, quality-checked, cached
When an admin opens a ticket whose last message is from the author, the console requests a draft. It is built from:
- **Rules + tone** (system prompt): BookLeaf voice, "acknowledge first, be specific, own mistakes, give a timeline, end with a next step"; stock phrases are banned; Printing & Quality replies must open with a sincere apology.
- **Only the knowledge-base sections relevant to the ticket's category** + that category's calibration examples (from the brief).
- **FACTS computed in code** from the DB: the referenced book's real numbers, the royalty cycle (quarter end, 45-day payout deadline, next payout date), the ₹1,000 threshold, overdue detection, listing gaps, production stage. **The model never does date or money arithmetic**, and anything it can't verify goes into `admin_notes`.
- **The last N thread messages**, each truncated (not the full history).

**Quality gate (`services/ai/quality.js`).** Each draft is checked for the greeting and the exact sign-off, banned stock phrases ("I understand...", "I'm sorry to hear", "rest assured", ...), the printing apology, length, and **grounding**: every ₹ amount and `14 November 2026`-style date in the reply must appear in the facts, knowledge base or ticket text. A failing draft gets **at most one** corrective regeneration (one extra metered call); if it still fails, the policy **template** is returned with an explanatory note. An admin always reviews and edits the draft; **nothing is ever sent to an author automatically.** The same gate is applied to the template drafts in tests.

### 3. Security
- `OPENAI_API_KEY` is read from the environment in one place (`config/index.js` -> `container.js` -> `openaiProvider.js`) and is never sent to the browser; the release gate fails a build whose bundle contains a key-like string.
- **Prompt-injection hardening (best effort):** author text is fenced in tags with `<`/`>` escaped, the system prompt states such content is data, not instructions, and the model has no tools that act on the system. The real protection is the human review of every draft; hardening was checked with an injection ticket during live testing.

### 4. Error handling & graceful degradation
| Failure | Behaviour |
|---|---|
| AI down / rate-limited / out of quota / bad key / timeout / no key | Ticket is **still created** (AI runs *after* the response). Triage falls back to **keyword rules** (tagged `Rules`, flagged for review). The draft falls back to a labelled **policy template**; the admin can always write manually. The endpoint still returns 200. |
| Repeated failures | **Circuit breaker** (4 consecutive failures -> 60 s pause). While paused, the **real failure category is preserved** (auth, quota, rate limit, timeout, unavailable): the admin note and the AI page say e.g. "the provider rejected the API key (calls temporarily paused)" instead of a generic "unreachable". No credentials or raw provider text are ever shown. |
| Invalid or low-quality model output | zod validation / quality gate -> one regeneration at most -> template. Neither trips the breaker. |
| Provider recovers | The failure marker clears on the next success; a cached *template* draft is replaced by a real AI draft the next time the ticket is opened. |
| Late AI result after an admin override | Never overwrites a value whose `*_source = admin`. |

### 5. Cost awareness
- One call for category+priority (not two). Small input: truncated ticket + one-line book summary.
- Drafts are **generated lazily**, **cached** (keyed by a hash of category/priority/ticket/thread/book state; regenerated only when something changed) and **de-duplicated** if two admins open the same ticket. The *UI* does not auto-generate a draft when an admin replied last; note that the underlying `GET /admin/tickets/:id/draft` endpoint will still generate one if called directly and none is cached.
- Static rules + policy sit in the system message and per-ticket content in the user message. OpenAI's automatic prompt caching was **observed for the longer draft prompts** (2,048 cached tokens across a 24-call run); the classification prompt (~800 tokens) is below OpenAI's 1,024-token caching minimum, so it is not expected to cache. Cached tokens are metered separately.
- Forced regenerations are limited to 12/min per admin (`routes/admin.js`; the limiter is switched off under test, so this limit is not covered by automated tests).
- **Every call is metered** (`ai_usage`: tokens in/out/cached, latency, failures) and shown with an estimated spend on the admin *AI & usage* page.

## API

Base path `/api/v1`. Spec: **OpenAPI 3.0.3** (`server/src/docs/openapi.yaml`, validated by `npm run validate:openapi` and by a test), Swagger UI at **`/api/docs`**, raw JSON at `/api/openapi.json`. Errors always look like `{ "error": { "code", "message", "details?", "requestId" } }`.

| Method & path | Role | Purpose |
|---|---|---|
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | public / any | Sign in (sets cookie + returns token), sign out, current user |
| `GET /health` · `GET /meta` | public / any | Liveness + AI availability · enums for the UI |
| `GET /books` · `GET /books/:bookId` | author (own) / admin | Books + royalty summary |
| `POST /tickets` | author | Submit query (JSON or multipart with attachments) |
| `GET /tickets` · `GET /tickets/:id` | author (own) | My tickets / one ticket with public conversation |
| `POST /tickets/:id/messages` · `POST /tickets/:id/close` | author (own) | Reply (reopens if Resolved) / close |
| `GET /tickets/:id/attachments/:attachmentId` | owner / admin | Download attachment |
| `GET /events` | any | SSE stream of ticket changes |
| `GET /admin/tickets` | admin | Queue: filters `status,category,priority,assignee,q,from,to`, `sort`, pagination |
| `GET /admin/tickets/:id` | admin | Conversation, internal notes, activity, author + books |
| `PATCH /admin/tickets/:id` | admin | Status, category/priority override, assign (`"me"`, id, `null`) |
| `POST /admin/tickets/:id/messages` | admin | Reply to the author (`setStatus: Resolved` optional) |
| `POST /admin/tickets/:id/notes` | admin | Internal note |
| `GET/POST /admin/tickets/:id/draft` | admin | Get cached AI draft / force regeneration |
| `POST /admin/tickets/:id/reclassify` | admin | Re-run AI triage |
| `GET /admin/stats` · `/admin/ai/status` · `/admin/ai/usage` · `/admin/admins` · `/admin/authors` | admin | Dashboard, AI health & cost, lookups |

Status codes used: `200/201/204`, `400` malformed JSON, `401` unauthenticated, `403` wrong role / CSRF, `404` not found (or not yours), `409` conflict (reply on a closed ticket), `413` attachment too large, `422` validation, `429` rate limited.

## Testing

`npm test` - **103 tests in 9 files** (Node's built-in runner + supertest, in-memory SQLite, **fake LLM provider** - no network, API key or cost). What each layer proves:

- **API / security:** auth, cookie + CSRF, RBAC matrix, other-author isolation, validation, attachments, queue filter/sort/search (including literal `%`/`_`), overrides, lifecycle (reopen/close, no admin replies on closed tickets), cross-author SSE isolation.
- **AI orchestration (fake provider):** outage -> ticket still created + rule triage; template draft then recovery; draft caching and concurrency de-duplication; invalid model output; ISBN policy floor; circuit breaker, **failure-reason preservation** for auth/quota/rate-limit/timeout; quality gate (banned phrases, printing apology, signature, invented amounts/dates), single regeneration and template fallback; prompt-injection fencing; royalty-cycle maths. These show the *orchestration* works - they say nothing about real model quality.
- **Provider adapter:** runs the real OpenAI SDK against a **local mock** of the Chat Completions API to verify the request shape (forced strict function call, token cap) and error translation (429 rate-limit, 429 `insufficient_quota`, 5xx, 401, refusal, truncated JSON, connection refused). The SDK-timeout branch is not exercised.
- **Seeding & release safety:** seeding policy as a pure function, and real production start-ups in child processes against temp databases (default = no seeding; explicit opt-in requires passwords); real Vite builds with `VITE_SHOW_DEMO` unset/false/true checked for demo credentials and secrets.
- **OpenAPI:** the spec validates under strict OpenAPI 3.0.3, matches the implemented routes exactly, and documents auth/error responses consistently.
- **Eval harness:** the opt-in evaluation's seven samples and checks, run offline (fallback path).

**Live AI evaluation result at release (`npm run eval:ai`, `gpt-4o-mini`, 14-15 calls per run, about $0.003 each):** the model classified all 7 sample queries into the expected category with a plausible priority and produced quality-gate-compliant drafts for 7/7 (ISBN, printing - now opening with a sincere apology, availability, production and general answers all met their content checks). **6/7 samples passed overall: the *royalty "too low"* sample still fails** its content check in every run - the reply corrects the author's copy count and quotes the right figures but does not reliably explain the net-profit deductions (printing, commission, shipping) or offer the breakdown, and replies for that sample vary between runs on this small model. The check was deliberately not loosened. This is the first thing to improve (see Known limitations).

Not covered by the automated suite: the **live OpenAI** behaviour (verified manually and via the opt-in `npm run eval:ai`), the **browser UI** (flows were driven with an ad-hoc headless-Chromium script during release verification; that script is not part of this repository), SDK timeouts, and the login/regeneration rate limiters (disabled under test; the login limiter was verified manually).

## Assumptions

- "Quarterly" = **calendar quarters** (ends 31 Mar / 30 Jun / 30 Sep / 31 Dec); payout due 45 days after. Computed in `services/royalty.js`.
- The dataset stores a **flat royalty per copy**, while the knowledge base describes 80% of net profit. The app shows the dataset's numbers as the source of truth and the AI explains the 80/20 policy but is told not to recompute amounts.
- Bank-detail status and production-stage start dates are **not in the data**, so the AI is told not to claim them and instead asks the admin to verify (`admin_notes`).
- ISBNs in the dataset are placeholders (`978-93-5XXXX-..`), so they are displayed, not validated.
- Authors are provisioned from the dataset; there is no self-signup/password reset (out of scope for the brief).

## Known limitations

- **Single instance:** the SSE hub is in-memory (multiple instances would need Redis pub/sub) and SQLite is a single-writer file database.
- **Attachments** are stored on local disk (type/size limited, served as downloads only; content is not sniffed) and can only be added when a ticket is created, not on replies.
- **Sessions:** logout clears the cookie but there is no server-side token revocation (12 h lifetime); the login response also returns the JWT in its body.
- Cookie-authenticated requests that carry **no `Origin` header** are accepted (mitigated by `SameSite=Lax`); ticket creation is **not idempotent** (a double submit creates two tickets).
- AI: the live behaviour under provider rate limits, quota exhaustion and timeouts is verified only against mocks; live drafts are quality-gated but not guaranteed perfect - hence the mandatory human review.
- **AI answer quality:** the live evaluation passes 6/7 samples; the *royalty "too low"* explanation is inconsistent (see Testing). Mitigated by the quality gate and mandatory human review, not eliminated.
- The **Dockerfile has not been built** and the Render blueprint has not been deployed.
- One unexplained V8 `Fatal process out of memory: Zone` crash was observed once during heavy local browser testing and could not be reproduced; the cause is unknown.
- **Next steps:** PostgreSQL + migrations, Redis for SSE/rate limits, object storage + AV scanning, server-side session revocation and MFA for staff, a growing AI eval set from real tickets, notifications to authors, accessibility audit.
