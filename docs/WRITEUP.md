# BookLeaf Author Support Portal - Write-up

**What I prioritised.** The ticket loop end to end, then the AI around it: an author submits a query, it is triaged automatically, the admin queue shows the most urgent and oldest tickets first, the admin edits an AI draft and replies, and the author sees it live. The AI removes repetitive reading, categorising and fact-finding, while a human stays accountable for every message sent.

**Architecture.** Express REST API (versioned, zod-validated, role-based, OpenAPI 3.0.3), React SPA, SQLite. Routes call services; ticket rules and access checks live in one service; repositories hold only SQL; one composition root injects dependencies so tests run on an in-memory database with a fake LLM. Live updates use Server-Sent Events carrying only ids, so clients re-fetch through the normal authorised API. Public messages and internal notes are separate tables, so a faulty query cannot leak a note.

**AI approach.** One strict function call returns category, priority, confidence and a rationale. Drafts are built from the relevant knowledge-base sections plus facts computed in code (royalty cycle, payout deadline, ₹1,000 threshold, production stage), so the model never does date or money arithmetic. A quality gate checks tone, sign-off, a printing apology, and that every amount and date appears in the supplied facts; a failing draft is regenerated once, then replaced by a policy template. Admins can override category and priority, and the override is never overwritten by a late AI result.

**Error handling and cost.** AI runs after the ticket is saved, so an outage never blocks a ticket: triage falls back to keyword rules, drafts to templates, and a circuit breaker pauses calls while preserving the real failure cause (bad key, quota, rate limit). Cost is controlled by one triage call, truncated inputs, only the relevant policy sections, lazy cached and de-duplicated drafts, at most one regeneration, and full token metering. 24 live calls cost about $0.004.

**Trade-offs.** SQLite and an in-memory event hub give a one-command demo at the cost of single-instance scale. Lazy drafting saves spend but adds a one-to-three-second wait on first open. A small model is cheap and fast; structure (facts, quality gate, human review) protects quality instead.

**Deliberately excluded.** Self-signup and password reset, real file storage, notifications to authors, server-side session revocation. Not yet done: public deployment (a Render blueprint and Dockerfile are prepared, not deployed).

**Towards production.** PostgreSQL with migrations, Redis for event fan-out and rate limits, object storage with virus scanning, MFA for staff, and observability on queue age, SLA breaches and AI error rate. For the AI: log how heavily admins edit drafts, grow an evaluation set from real tickets, and consider auto-sending only low-risk categories once accuracy is measured.
