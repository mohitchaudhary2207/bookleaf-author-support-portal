# BookLeaf Author Support & Communication Portal

A full-stack web app that lets BookLeaf authors raise support tickets and lets the operations team resolve them faster, with **AI-assisted triage and reply drafting** that degrades gracefully when the AI is unavailable.

- **Author portal** - email/password login, *My Books* (royalties, production progress), *Submit a query* (with optional attachments), *My Tickets* with live updates and replies.
- **Admin console** - urgency-sorted ticket queue with filters, AI category + priority (overridable), AI-drafted replies grounded in the BookLeaf knowledge base, internal notes, assignment, audit trail, SLA flags, AI usage/cost page.
- **REST API** - versioned, role-based, validated, documented with OpenAPI (Swagger UI at `/api/docs`).

| | |
|---|---|
| **Live demo** | _add your deployed URL here_ |
| **API docs** | `<your-url>/api/docs` (Swagger UI) · `<your-url>/api/openapi.json` |
| **Stack** | Node 22 · Express 4 · SQLite (better-sqlite3) · React 18 + Vite · Server-Sent Events · OpenAI (gpt-4o-mini) |

## Test credentials

The database is seeded from the provided dataset (10 authors, 18 books) plus 5 demo tickets.

| Role | Email | Password |
|---|---|---|
| Admin (support lead) | `admin@bookleaf.com` | `Admin@123` |
| Admin | `support@bookleaf.com` | `Admin@123` |
| Author (any of the 10) | `priya.sharma@email.com`, `rohit.kapoor@email.com`, `ananya.reddy@email.com`, `vikram.joshi@email.com`, `meera.nair@email.com`, `arjun.malhotra@email.com`, `sneha.kulkarni@email.com`, `farhan.sheikh@email.com`, `kavita.deshmukh@email.com`, `diya.chatterjee@email.com` | `Author@123` |

The login page has a "Demo accounts" panel that fills these in (hide it with `VITE_SHOW_DEMO=false` at build time).

Edge cases from the dataset worth trying:
- **Sneha Kulkarni** - *Midnight in Mysore* is in production (no MRP / sales; shows a progress stepper).
- **Ananya Reddy / Arjun Malhotra** - published, earning, but never paid (royalty-paid ₹0).
- **Kavita Deshmukh** - *The Nagpur Notebooks* has ₹850 pending, below the ₹1,000 minimum payout (rolls over); *Raising Roots* is in typesetting.
- **Farhan Sheikh / Priya's *Saffron Diaries*** - fully paid, ₹0 pending.

## Run locally

Requires Node 22.9+ (uses `--env-file-if-exists`).

```bash
npm install                      # installs server + client (npm workspaces)
cp .env.example server/.env      # then edit: OPENAI_API_KEY, JWT_SECRET
npm run dev                      # API on :4000, web app on http://localhost:5173
```

- Without `OPENAI_API_KEY` the app runs in **manual mode** (rule-based triage + template drafts) - everything still works.
- `npm test` runs the server test suite (49 tests, no network or API key needed).
- Production: `npm run build && npm start` serves the API **and** the built React app from one process on `$PORT`.
- Reset demo data: delete `server/storage/bookleaf.db` or run `npm run seed -w server -- --force`.

### Environment variables

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM key. **Server-side only** - never sent to or bundled into the frontend. |
| `AI_MODEL` | Default `gpt-4o-mini` (cheap, fast, ideal for classification + short drafts). |
| `AI_PRICE_INPUT/OUTPUT/CACHE_READ` | USD per 1M tokens, used only for the cost estimate on the admin AI page. |
| `AI_ENABLED` | `false` forces manual mode. |
| `JWT_SECRET` | Required in production (the server refuses to start without it). |
| `DATABASE_PATH`, `UPLOAD_DIR` | Storage locations (default `server/storage/...`). |
| `SEED_AUTHOR_PASSWORD`, `SEED_ADMIN_PASSWORD` | Passwords for seeded accounts. |
| `CORS_ORIGINS` | Only needed if the frontend is hosted on a different origin. |

### Deploy

Single service (API + static frontend): `render.yaml` (Render blueprint) and a `Dockerfile` are included. Set `JWT_SECRET` and `OPENAI_API_KEY`; the database auto-seeds on first boot. On a free host with an ephemeral disk the data resets on restart (fine for a demo) - attach a disk and set `DATABASE_PATH` to persist.

## Architecture

```
client/  React SPA (Vite)            server/src/
  context/  auth, live (SSE), toasts   app.js            Express app: security headers, routing, error handler
  api/      fetch client + hooks       container.js      composition root (the only place concrete deps are chosen)
  pages/    author/  admin/            routes/           thin HTTP layer: parse -> validate -> call service
                                       schemas/          zod request schemas (single source of validation truth)
                                       middleware/       auth + RBAC, CSRF origin check, validation, uploads, errors
                                       services/         ticketService (lifecycle rules), events (SSE hub), royalty maths
                                       services/ai/      aiService, openaiProvider, prompts, knowledgeBase, facts,
                                                         rules (fallback triage), templates (fallback drafts)
                                       repositories/     SQL only (users, books, tickets, ai)
                                       db/               schema.sql, seed
```

**Decisions and why**

- **Layering: routes -> services -> repositories.** Routes only translate HTTP; business rules (reopen on author reply, auto-assign on first reply, override protection, audit log) live in `ticketService`; SQL lives in repositories. A composition root (`container.js`) injects dependencies, so tests swap in an in-memory DB and a fake LLM without mocking modules.
- **SQLite.** Zero-ops, transactional, and the schema is what matters: `authors`, `books`, `tickets`, `ticket_messages` (public) and `ticket_notes` (internal) are **separate tables** so a bad query can never leak an internal note to an author; plus `ticket_activity` (audit), `ai_drafts` (cache), `ai_usage` (metering). Triage fields carry a `*_source` (`ai | rules | admin`) so overrides are auditable and never clobbered by a slow AI call.
- **Real time = Server-Sent Events.** Updates are one-way, ride plain HTTP (cookies, proxies), and `EventSource` auto-reconnects. Events carry **only ids**; clients re-fetch via the REST API, so authorization lives in exactly one place. After a reconnect the client resyncs. Authors only receive events for their own tickets; internal-note/triage events are admin-only.
- **Auth.** bcrypt-hashed passwords; JWT delivered as an **httpOnly, SameSite=Lax cookie** (also accepted as `Authorization: Bearer` for API clients). The user is re-read from the DB per request. Cookie-authenticated writes pass an **Origin check** (CSRF). Login is rate-limited and returns the same error for unknown email and wrong password. Other authors' resources return **404, not 403**, so ids can't be probed.
- **Authorization is enforced in the service layer**, not just by route guards: every ticket load goes through `loadAccessible(user, id)`.
- **Validation** with zod on every input; errors are `422 { error: { code, message, details:[{path,message}] } }` and the UI maps `details` onto form fields. SQL is always parameterised; search wildcards are escaped.
- **SLA / urgency.** The queue sorts unresolved-first, then priority (Critical>Low), then oldest-first. Each ticket has a first-response target by priority (Critical 4h, High 24h, Medium 48h, Low 72h) and is flagged **Overdue** when missed.

## How the AI integration works

**Model choice: OpenAI `gpt-4o-mini`.** The tasks are short and well-specified (classify a ticket, write ~150 words from supplied facts), so a small, fast, inexpensive model is the right fit: $0.15 / $0.60 per million input/output tokens, so a ticket's triage + draft costs a small fraction of a cent (a measured end-to-end run of one triage + one draft was ~$0.0005). It supports strict, schema-enforced function calling, which is what makes the output reliable. Swapping providers means implementing one method (`callTool`) in `services/ai/` - the rest of the app does not know which vendor is behind it.

### 1. Triage - one call, category **and** priority
`aiService.triage()` sends only the ticket subject/description (truncated) and a one-line summary of the referenced book - **not** the knowledge base and **not** the thread. The model must answer through a forced, **strict** function call (`classify_ticket`) with an enum-constrained category/priority, a confidence and a one-sentence rationale shown to the admin. The prompt contains a priority **rubric** (e.g. "no royalty for ~6 months on a live book" = Critical, ISBN errors = High, bio update = Low). After the model answers, **policy guardrails** apply (ISBN errors are never below High). Output is validated with zod; anything invalid triggers the fallback.

### 2. Draft - grounded, lazy, cached
When an admin opens a ticket whose last message is from the author, `getDraft` builds a prompt from:
- **Rules + tone** (system prompt): BookLeaf voice, "acknowledge first, be specific, own mistakes, give a timeline, end with a next step", no generic AI phrases, and a signature format.
- **Only the knowledge-base sections relevant to the ticket's category** + that category's calibration examples (from the brief) - royalty tickets don't pay tokens for printing policy.
- **FACTS computed in code** from the DB: the referenced book's real numbers, the royalty cycle (last quarter end, 45-day payout deadline, next payout date), whether the pending amount is below the ₹1,000 threshold, whether a never-paid book is genuinely overdue, which platforms a book is/isn't listed on, production stage. **The model never does date or money arithmetic**, and is told to use *only* these facts and to put anything it can't verify into `admin_notes` ("Before you send: confirm bank details...").
- **The last N thread messages**, each truncated (not the full history).

The reply is returned via a forced `submit_reply` function call (`reply` + `admin_notes`). The admin edits freely and sends; the reply appears on the author's ticket immediately. Replies are flagged `aiAssisted` for analytics.

### 3. Security
- `OPENAI_API_KEY` is read from the environment in one file (`openaiProvider.js`) and is never exposed to the browser (verified: the built bundle contains no key or key-handling code, only the variable's *name* in an admin help message).
- **Prompt injection hardening:** author text is fenced in tags and `<`/`>` are escaped so it can't forge structure; the system prompt states that such content is data, not instructions; no tool can act on the system (the model only returns text), and a human reviews every draft before the author sees it.

### 4. Error handling & graceful degradation
| Failure | Behaviour |
|---|---|
| AI down / rate-limited / timeout / no key | Ticket is **still created** (AI runs *after* the response). Triage falls back to **keyword rules** (tagged `Rules`, flagged for review). Draft falls back to a clearly labelled **policy template** built from the same facts; the admin can always write manually. Endpoint still returns 200. |
| Repeated failures | **Circuit breaker** (4 failures -> 60 s pause) so a dead provider isn't hammered and requests don't hang. |
| Invalid model output | zod validation -> fallback (counted as a non-infrastructure failure, doesn't trip the breaker). |
| Provider recovers | A cached *template* draft is automatically replaced by a real AI draft next time the ticket is opened. |
| Late AI result after an admin override | Never overwrites a value whose `*_source = admin`. |

### 5. Cost awareness
- One call for category+priority (not two). Small input: truncated ticket + one-line book summary.
- Drafts are **generated lazily**, **cached** (keyed by a hash of category/priority/ticket/thread/book state; regenerated only when something changed), **de-duplicated** if two admins open the same ticket, and **not auto-generated** when an admin replied last.
- Static rules + policy sit in the system message and per-ticket content in the user message, so the prompt prefix is identical between calls and benefits from OpenAI's automatic prompt caching (cached tokens are metered separately). Tight `max_completion_tokens`, small model.
- Regeneration is rate-limited per admin.
- **Every call is metered** (`ai_usage`: tokens in/out/cached, latency, errors) and shown with an estimated spend on the admin *AI & usage* page.

## API

Base path `/api/v1`. Full spec: **Swagger UI at `/api/docs`** (OpenAPI 3 at `server/src/docs/openapi.yaml`). Errors always look like `{ "error": { "code", "message", "details?", "requestId" } }`.

| Method & path | Role | Purpose |
|---|---|---|
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | public / any | Sign in (sets cookie + returns token), sign out, current user |
| `GET /meta` | any | Enums for the UI |
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

`npm test` - 49 tests (Node's built-in runner + supertest, in-memory DB, fake LLM provider):
- **API:** auth, cookie + CSRF, RBAC matrix, other-author isolation, validation, attachments, queue filter/sort/search, SQL-metacharacter search, overrides, lifecycle (reopen/close).
- **AI:** outage -> ticket still created + rule triage; template draft then recovery; draft caching & concurrency de-dupe; invalid model output; ISBN policy floor; circuit breaker; prompt size/relevance; prompt-injection fencing; royalty-cycle maths; rule-based triage on the brief's own examples; token metering.
- **Provider adapter:** runs the real OpenAI SDK against a local mock of the Chat Completions API to verify the request shape (forced strict function call, token cap) and translation of 429 rate-limit / 429 insufficient-quota / 5xx / 401 / refusal / truncated-JSON / connection errors.
- **SSE:** the author receives an event when an admin replies; admin-only events never reach authors.

I also drove the UI end to end in a headless browser (author submits -> admin queue updates live -> AI/template draft -> reply -> author sees it without refreshing).

## Assumptions

- "Quarterly" = **calendar quarters** (ends 31 Mar / 30 Jun / 30 Sep / 31 Dec); payout due 45 days after. Computed in `services/royalty.js`.
- The dataset stores a **flat royalty per copy**, while the knowledge base describes 80% of net profit. The app shows the dataset's numbers as the source of truth and the AI explains the 80/20 policy but is told not to recompute amounts.
- Bank-detail status and production-stage start dates are **not in the data**, so the AI is told not to claim them and instead asks the admin to verify (`admin_notes`).
- ISBNs in the dataset are placeholders (`978-93-5XXXX-..`), so they are displayed, not validated.
- Authors are provisioned from the dataset; there is no self-signup/password reset (out of scope for the brief).

## Known limitations / what I'd do next

- **Single-node real time:** the SSE hub is in-memory; multiple instances need Redis pub/sub (call sites unchanged).
- **SQLite:** fine for this scale; move to PostgreSQL (the repository layer isolates SQL) for multi-node, plus migrations tooling.
- **Attachments** are stored on local disk (type/size limited, served as downloads only); production would use object storage + virus scanning.
- **Auth hardening:** add password reset, MFA for admins, account lockout, and refresh-token rotation; short-lived sessions.
- **AI quality loop:** log admin edit-distance between draft and sent reply, collect thumbs up/down, build an eval set from real tickets, and use embeddings/RAG once the knowledge base outgrows a few sections.
- **Streaming drafts** for lower perceived latency; **batch API** for bulk back-fill triage.
- **Observability:** structured logs, metrics (queue age, SLA breaches, AI error rate) and alerting; request ids are already propagated.
- Accessibility pass (keyboard flows exist; needs a full audit) and i18n (Hindi) for authors.
