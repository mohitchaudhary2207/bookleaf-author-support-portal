# UI redesign notes (Phase 2)

Scope: the frontend look-and-feel and one functional change - AI reply drafts are now generated only when an admin asks.
The Node/Express backend, SQLite schema, authentication, RBAC, SSE, attachments, AI triage and business policies are
unchanged. See [BOOKLEAF_DESIGN_SYSTEM.md](BOOKLEAF_DESIGN_SYSTEM.md) for the tokens and their provenance.

## 1. Problems with the original UI

- Teal/green "generic dashboard" palette with no relationship to BookLeaf's coral identity; a leaf emoji instead of the logo.
- Emoji used as icons (navigation, empty states, alerts) and inconsistent button/badge/card styles.
- One 169-line stylesheet with page-specific rules and no tokens.
- The production-stage tracker wrapped its connector lines and could overflow narrow cards (flagged in the audit).
- The admin queue was a wide table with no created-date or SLA column and no mobile layout.
- The admin ticket page generated an AI draft as a side effect of opening the ticket (spending tokens whether or not the admin wanted one).
- A fresh, signed-out visit to the login page showed "Your session ended" (the on-load session probe's 401 was treated as an expiry).

## 2. Brand references used

Supplied in `brand-reffrences/` (a local folder, deliberately not committed; the logo is copied unmodified to `client/src/assets/brand/`): the official logo (`logo.avif`), a website screenshot, the heading/sub-heading/button style
screenshot and a DevTools screenshot showing the Lato font family. Colours were sampled from those screenshots. The live site
was fetched for page structure and tone, but it is a Wix site and its stylesheet was not readable, so no value in the design
system claims to come from BookLeaf's CSS. Details and limits: section 1 of the design-system document.

## 3. Design decisions

- **Identity kept, decoration dropped.** Coral, Lato, pill buttons, white surfaces, 16-px cards and soft pink tints come from the
  brand; blobs and avatars appear only as a restrained backdrop on the login page.
- **Contrast over fidelity for the main button.** Sampled coral `#F26A7A` with white text is 2.95:1, so primary buttons use
  `#D63A4E` (4.59:1). Coral stays the accent for the logo, progress and focus.
- **Danger is not coral.** Errors and Critical use a separate crimson so "brand" and "problem" stay distinguishable.
- **AI is indigo.** AI-generated content (draft panel, AI tags, rationale) uses one muted indigo accent so machine text is
  never confused with an admin's own writing; template drafts use the warning amber.
- **Sidebar navigation** (white, so the logo sits on its own white background) instead of a top bar; collapsible on desktop,
  drawer on tablet/mobile.
- **No fake data or imagery.** Every figure comes from existing endpoints. There are no book covers in the dataset, so books show
  an icon tile, not an invented cover.
- **Author-facing ticket metadata unchanged.** The brief lists category and priority for the author's ticket list, but those are
  internal triage fields the API deliberately does not expose to authors, so they are not shown.

## 4. New design tokens

`client/src/styles/tokens.css`: brand (`--brand-50..700`), ink (`--ink-300..900`), surfaces (`--bg`, `--surface`, `--line`),
functional (`--ok`, `--warn`, `--danger`, `--info`, `--ai-*`, each with `-bg`/`-line`), type (`--font`, `--fs-*`), radius
(`--r-pill/lg/md/sm`), 4-px spacing (`--s-1..8`), shadows, focus ring, motion and layout sizes. Files: `tokens.css`,
`base.css`, `components.css`, `shell.css`, `pages.css`, imported in order by `styles.css`.

## 5. Screens redesigned

Login · Author: **Dashboard (new)**, My Books, My Tickets, Submit a query, Ticket detail · Admin: **Dashboard (new)**, Ticket
queue, Ticket workspace, AI Usage · 404.

New routes: `/dashboard` (author home) and `/admin/dashboard` (admin home). All existing routes are unchanged. The author
dashboard uses `GET /books` and `GET /tickets`; the admin dashboard uses `GET /admin/stats` and `GET /admin/tickets`.
No backend change was needed for either.

## 6. Components added or modified

New: `Brand.jsx` (logo + cropped mark), `Stat`, `Alert`, `Skeleton` / `PageSkeleton`, `Pagination`, `ConfirmModal` (native
`<dialog>`, replaces `window.confirm` in three places), toast icons. Rewritten: `Layout`, `Common`, `Conversation`,
`Badges` styling, `LoginPage`, every page under `pages/`. Tooltips are CSS (`data-tip`). Icons: `lucide-react` (the only new
dependency; no animation or chart libraries - the charts are CSS bars).

## 7. AI generation: how it works now

**Where the auto-generation lived.** Two places, both removed:
1. `AdminTicketPage`'s composer had a `useEffect` that called `GET /admin/tickets/:id/draft` whenever the author had written last;
2. the **backend** `GET /admin/tickets/:id/draft` generated a draft on first open (so hiding it in the UI would not have stopped the token spend).

**Now.**
- `GET /admin/tickets/:id/draft` is strictly read-only: it returns the saved draft (with `stale: true` if the ticket or conversation
  changed since) or `204 No Content`. It never calls the model, never writes.
- `POST /admin/tickets/:id/draft` is the only generation endpoint - the "Generate AI Response" / "Regenerate" button. It keeps the
  existing quality gate, token metering, circuit breaker, template fallback, admin notes, per-admin rate limit and in-flight
  de-duplication (the service method is now `generateDraft`; `getDraft` is the read).
- Opening a ticket makes one `GET` for a saved draft. If one exists it is placed in the editor (never over text the admin typed);
  otherwise the panel shows: "Need help responding to this author? Generate an AI-crafted response using the BookLeaf Knowledge
  Base and ticket context." and the button. If the AI is unavailable the panel says so and that a policy template will be prepared.
- While generating: disabled button with spinner, skeleton lines. On success: toast + the text in the editable field, labelled
  "AI draft" (and "AI draft · edited by you" once changed). On failure: an error with "Try again", and manual writing stays possible.
- If the editor holds edited text, regenerating asks for confirmation first (it costs tokens and replaces the text).
- Sending is a separate, explicit click (**Send reply** / **Send & resolve**). Triage (category + priority) is untouched.
- OpenAPI updated (`204`, `stale`, `409`/`429`), the eval harness calls `generateDraft`, README updated.

## 8. Responsive behaviour

- Under 900 px the sidebar becomes a drawer (menu button, scrim, Esc to close).
- The queue table becomes labelled cards under 760 px; the filter bar reflows; stat tiles go to two columns.
- The production tracker is a single non-wrapping grid and becomes a vertical list in narrow cards (container query) - this
  fixes the audit's tracker overflow. Verified in a browser at 1440, 820 and 390 px: the tracker stays inside its card.
- Every page was checked for horizontal overflow at the three widths (see below).

## 9. Verification (actually run)

- `npm test`: **113/113** (was 103; 10 new tests for explicit generation; 2 rewritten, plus mechanical GET->POST changes in the reliability tests).
- `npm run build`, `npm run validate:openapi` (24 paths, 27 operations), `npm run check:bundle`, `npm audit` (0 vulnerabilities): all pass.
- Browser (Microsoft Edge driven by `playwright-core`, via `scripts/ui-check.mjs`) against an **isolated server with a temporary
  database**, not the real one: **76/76 checks** - login validation and password toggle; both portals on every screen at 1440, 820
  and 390 px with no horizontal overflow; tracker inside its card; the queue fits at 1440 px; drawer opens and Esc closes it;
  authors never see internal notes, AI triage or the Generate button; **opening a ticket (and reopening it twice) issued zero `POST`
  draft requests**; the button is shown and the editor starts empty.
- One additional run with `--live-ai` (a single real gpt-4o-mini call, run before the final layout polish): clicking Generate sent
  exactly one `POST`, the button was disabled while generating, the 797-character draft appeared in the editable field, edits were kept,
  reopening the ticket showed the saved draft with no new `POST`, nothing reached the author until **Send reply**, and sending worked.
  That live walk-through was run once; the final 76-check run did not repeat it.
- The built app was loaded under the production Content-Security-Policy: logo and self-hosted Lato load, no violations.

## 10. Screenshots

`docs/screenshots/` (21 images captured from the runs above): login, author dashboard / books / tickets / new ticket / ticket,
admin dashboard / queue / empty-AI ticket / generating / draft ready / edited draft / AI usage, collapsed sidebar, mobile queue
cards, mobile drawer, production tracker. File names carry the viewport (`desktop-`, `tablet-`, `mobile-`).

## 11. Known visual and design limitations

- **Logo resolution.** The supplied logo is 180 x 79 px and is used unscaled; on high-density displays it is a little soft. A vector
  original from BookLeaf would fix this. The favicon and collapsed-sidebar mark are crops of the same file.
- **Primary button is deeper than the brand coral** (accessibility trade-off, section 3).
- No brand font weights beyond 400/700/900 are loaded; no italic.
- Brand research is limited to the supplied assets (the site's CSS and the public author dashboard could not be read).
- There is no dark mode, and no automated frontend component tests (`scripts/ui-check.mjs` is an opt-in browser script and was not run in CI).
- The ticket-status timeline and queue sort icons are simple; richer history views were out of scope.
- Real-time updates, the SSE indicator and real replies were exercised only lightly in this pass (a reply was sent and rendered; two-browser live push was not re-tested).
- Pre-existing items from the audit that this pass did not address: no server-side session revocation, Origin-less cookie POSTs accepted, non-idempotent ticket creation, Dockerfile never built, nothing deployed.
