# Write-up: BookLeaf Author Support & Communication Portal

**Approach.** I treated this as an operations problem first and an AI problem second: authors need to see their money and get answers; the support team needs the queue to tell them *what to do next*. The AI is there to remove the repetitive parts (reading, categorising, researching the author's data, drafting) while a human stays accountable for every message that leaves the building.

**What I prioritised (in order).**
1. **The ticket loop end to end** - author submits -> triaged -> admin sees the most urgent first -> reply -> author sees it live. Real time uses Server-Sent Events carrying only ids, so authorization stays in one place.
2. **AI integration quality (the 25% criterion).** One cheap call classifies *and* prioritises with an explicit rubric; drafts are grounded in the knowledge base (only the relevant sections), in **facts computed in code** (royalty cycle, payout deadline, ₹1,000 threshold, listing gaps) and in the author's actual book data, so the model never does money/date maths and is told to flag what it cannot verify. Admins can override category and priority; overrides are audited and can't be overwritten by a slow AI response.
3. **Graceful degradation.** AI work happens *after* the ticket is saved. If the provider is down or rate-limited, tickets are rule-triaged (and visibly marked "Rules, please review"), drafts fall back to policy templates, a circuit breaker stops hammering a dead provider, and admins can always write by hand.
4. **Cost awareness.** Truncated inputs, relevance-selected policy sections, lazy + cached + de-duplicated drafts, no auto-draft when an admin already replied, prompt-cache-friendly prompts, per-admin regeneration limits, and every call metered (tokens, latency, errors) on an admin page with an estimated spend.
5. **API and security basics done properly:** zod validation with field-level errors, cookie + bearer auth, RBAC enforced in the service layer, other users' resources return 404, CSRF origin check, rate-limited login, parameterised SQL, OpenAPI docs.

**Trade-offs.**
- *SQLite and an in-memory SSE hub* over Postgres/Redis: zero infrastructure and a one-command demo, at the cost of single-node scale. The repository and event-bus seams make both swaps local.
- *Lazy draft generation* (on ticket open) over pre-generating for every ticket: it saves spend on tickets nobody opens and always uses the latest context, at the cost of a ~1-3 s wait the first time; the UI shows progress and falls back instantly to a template if the AI is slow or down.
- *A small model (`gpt-4o-mini`)* over a larger one: classification and short, fact-grounded replies don't need more, and latency/cost matter at 1,200+ books a month. Quality is protected by structure (facts + rubric + policy floor + human review) rather than model size.
- *Flat-royalty dataset vs 80/20 policy:* I show the data as truth and have the AI explain the policy without recomputing it, rather than invent a calculation the data can't support.
- I skipped self-signup, password reset and real file storage - not in the brief, and each is a distinct production concern.

**Evolving this into production.**
- **Platform:** PostgreSQL + migrations, Redis for SSE fan-out and rate limiting, object storage + AV scanning for attachments, SSO/MFA for staff, queue-backed AI jobs with retries.
- **AI quality loop:** record how much admins edit each draft, add thumbs up/down, build an eval set from real tickets (classification accuracy; "did the reply use only supplied facts"), A/B prompts, and move the knowledge base to retrieval once it grows. Auto-send is a later, opt-in step for low-risk categories only after measured accuracy.
- **Operations:** SLA dashboards and breach alerts, duplicate/related-ticket detection, canned-reply analytics, richer author context (live royalty statements, order tracking), and proactive notifications (e.g. "payout scheduled for 14 Nov") that deflect tickets before they are raised.
