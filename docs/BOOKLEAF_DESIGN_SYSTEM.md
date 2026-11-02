# BookLeaf Design System (portal UI)

This document records the brand evidence the portal's UI is based on, and the design decisions built on it.
Every statement is tagged:

- **Observed** - taken directly from the supplied reference folder (`brand-reffrences/`) or from the live site.
- **Recommendation** - my own design decision, made to turn the brand into a usable product interface.

Nothing here is presented as an "official" value unless it was observed.

## 1. Evidence used

| Source | What it gave us |
|---|---|
| `brand-reffrences/logo.avif` (supplied) | The official logo, 180 x 79 px (unscaled). |
| `brand-reffrences/website-ss.png` (supplied) | A screenshot of a BookLeaf web page: header, FAQ cards, coral footer. |
| `brand-reffrences/title,subtitle,butto style.png` (supplied) | Hero heading, sub-heading and primary button styling. |
| `brand-reffrences/fonts.png` (supplied) | Browser DevTools showing the site's `font-family` (Lato). |
| https://www.bookleafpub.com/ (fetched) | Page structure, navigation labels, copy tone, company facts. |

**Limits of the research.** The live site is built on Wix and the fetch tool returns converted text, not raw CSS, so the
site's own stylesheet values could not be read. Colours were therefore **sampled from the supplied screenshots**
(pixel values, so they are accurate to what the screenshots show but are not copied from a style sheet). The public
author dashboard (`dashboard.bookleafpub.in`) is rendered with JavaScript and returned an empty shell, so its login UI
could not be inspected. Other pages (About, Contact, packages) were read for tone and structure only.

## 2. Brand identity

### Observed
- **Logo**: a solid coral square containing a white diagonal slash, followed by the wordmark "BookLeaf / Publishing" in a
  light, thin sans-serif, with a small tagline underneath. The supplied file also carries `www.bookleafpub.com`.
  The logo file has an opaque white background.
- **Primary colour**: coral. Sampled from the screenshots: footer fill and button fill `#F26A7A`; hero heading
  `#F16876`.
- **Soft pink tints** used for borders, chips and decorative blobs: `#FDEFF1`, `#FBD2D7`, `#F7E2E5`.
- **Text**: question headings are a warm near-black `#3D2F2F`; supporting copy is neutral grey `#5E5E5E`.
- **Background**: near-white `#FFFDFD`; content sits on white.
- **Typeface**: **Lato** (DevTools screenshot shows `font-family: ... orig_lato_regular`). The hero heading is Lato bold in
  coral; body copy is Lato regular.
- **Buttons**: fully rounded pills, coral fill, white text, semi-bold; the header CTA ("Track My Book") is a smaller
  pill of the same style.
- **Cards** (FAQ items): white, ~1px pale pink border, large radius (~16 px), very soft shadow, a small circular pink chip
  holding a chevron icon.
- **Navigation**: plain text links in grey on white, logo left, one coral pill CTA right.
- **Footer**: full-width coral band with white text and bold upper-case column headings.
- **Imagery**: soft pink blob / cloud shapes as background decoration; circular author avatars as social proof.
- **Personality** (copy): warm, aspirational, author-first, with strong social proof ("3,300+ google reviews").

### Recommendation (product translation)
The website is a marketing surface. The portal is an operations tool, so we keep the *identity* (coral, Lato, pills, soft
pink tints, generous radii, white surfaces, the official logo) and drop the *decoration* (blobs, avatars, full-bleed
coral bands). Coral is used sparingly: logo, primary action, active navigation, key accents.

## 3. Colour tokens

All tokens live in `client/src/styles/tokens.css`.

| Token | Value | Basis | Use |
|---|---|---|---|
| `--brand-500` | `#F26A7A` | Observed | Logo-matching accent: progress fills, chart bars, focus glow, decorative |
| `--brand-600` | `#D63A4E` | Recommendation | Primary buttons, links (4.59:1 on white) |
| `--brand-700` | `#B8283D` | Recommendation | Hover, text on tinted backgrounds |
| `--brand-100` | `#FBD2D7` | Observed | Borders on brand-tinted surfaces |
| `--brand-50` | `#FDEFF1` | Observed | Active nav, tinted panels |
| `--ink-900` | `#3D2F2F` | Observed | Headings, primary text (12.8:1) |
| `--ink-600` | `#5E5E5E` | Observed | Supporting text (6.5:1) |
| `--ink-500` | `#6B5D5D` | Recommendation | Muted / metadata text (>= 4.5:1 on all surfaces) |
| `--bg` | `#FBF7F7` | Recommendation | App canvas (a warm off-white; the site uses `#FFFDFD`) |
| `--surface` | `#FFFFFF` | Observed | Cards, sidebar (the logo's own background is white) |
| `--line` | `#F0E3E5` | Recommendation (derived from `#F7E2E5`) | Borders and dividers |
| `--ai-600` / `--ai-50` | `#5B4BC4` / `#F3F1FD` | Recommendation | AI-generated content only |
| `--ok`, `--warn`, `--danger`, `--info` (+ `-bg`) | see file | Recommendation | Status colours |

**Why the primary button is not the sampled coral.** White text on `#F26A7A` is 2.95:1, below WCAG AA (4.5:1) for normal
text. The website accepts that for its marketing buttons; for a tool people read all day we use `--brand-600`, the same
hue one step deeper (4.59:1). The sampled coral remains the identity colour everywhere contrast is not required.

**Why danger is not coral.** Coral is the brand colour, so using it for errors would blur "brand" and "problem". Danger
and Critical use a deeper crimson (`--danger`) and are always paired with an icon or text label.

**AI accent.** AI-generated content gets its own muted indigo so admins can tell machine text from their own at a
glance. It is a functional colour, not a brand colour.

## 4. Typography

Lato (SIL Open Font License) is self-hosted from `client/src/assets/fonts/` in weights 400, 700 and 900, so there is no
third-party request and the CSP stays `self`.

| Role | Size / weight | Notes |
|---|---|---|
| Display | 32-40 px / 900 | Login hero only, coral (mirrors the site's coral hero heading) |
| Page heading | 28 px / 700 | `h1`, `--ink-900` |
| Section heading | 17 px / 700 | Card titles |
| Body | 15 px / 400 | Line height 1.55 |
| Supporting | 14 px / 400 | `--ink-600` |
| Label | 13 px / 700 | Form labels, table headers |
| Button | 15 px / 700 | |
| Table text | 14 px | |
| Metadata | 12.5 px | Ticket numbers use a monospace stack |

## 5. Shape, spacing, depth

- **Radius**: pill (`999px`) for buttons, badges and chips (observed); `16px` cards, `12px` inputs, `8px` small
  controls (card radius observed, others recommended).
- **Spacing**: 4-px scale (`--s-1` 4 px ... `--s-8` 48 px).
- **Borders**: 1 px `--line`. Cards rely on border + a very soft shadow, like the site's FAQ cards.
- **Shadows**: `--shadow-sm` (cards), `--shadow-md` (popovers, modal). No heavy or coloured shadows.
- **Motion**: 120-200 ms ease; everything is disabled under `prefers-reduced-motion`.

## 6. Components

All shared styles are in `client/src/styles/components.css`; React building blocks are in
`client/src/components/`. Pages do not define their own button, card, badge or table styles.

| Component | Notes |
|---|---|
| Buttons | `btn-primary` (brand-600 pill), `btn-secondary` (outline pill, default `btn`), `btn-ghost`, `btn-danger`; sizes `btn-sm`; loading and disabled states |
| Inputs | 44 px tall, 12 px radius, brand focus ring; search input with icon; select with custom chevron; textarea |
| Cards | White, 16 px radius, 1 px line, soft shadow; `Card` component with title/actions |
| Tables | Sticky-feel header, 14 px text, row hover, priority rail on overdue rows; horizontally scrollable inside its wrapper on small screens |
| Badges / status | Pill badges with a leading dot; status, priority and category variants; AI / Rules / Manual source tags |
| Modal | Native `<dialog>` (focus trap and Esc for free), used for confirmations |
| Drawer | The sidebar becomes an off-canvas drawer under 900 px |
| Tooltip | CSS `data-tip` on icon-only controls, plus `title` |
| Toast | Bottom-right stack, icon + message + optional action |
| Empty state | Lucide icon in a tinted circle, title, one sentence, optional action |
| Skeleton | Shimmer blocks; static under reduced motion |
| Pagination | Prev / next with position, shared component |

## 7. Navigation and layout

- **Recommendation**: a left sidebar (white, so the official logo sits on its own background), collapsible on desktop and a
  drawer on tablet/mobile. Active item: `--brand-50` background, `--brand-700` text, 3-px coral rail.
- Author portal: Dashboard, My Books, My Tickets, Get Support.
- Admin portal: Dashboard, Ticket Queue, AI & Usage.

## 8. Iconography

Lucide (`lucide-react`, ISC licence), 1.75 px stroke, 18-20 px, one family everywhere. No emoji are used as icons.

## 9. Logo usage

- The supplied `logo.avif` is copied **unmodified** to `client/src/assets/brand/bookleaf-logo.avif` and shown at its
  natural size (180 x 79) or smaller; it is never recoloured, stretched or re-drawn.
- On narrow/collapsed navigation, the coral slash-square is shown by cropping the same file with CSS (no new artwork).
- The favicon is an exact, unscaled crop of that square from the supplied file.
- The logo's resolution is low (it is a web-optimised asset). A vector/SVG original from BookLeaf would look sharper on
  high-density displays; see *Known limitations* in `UI_REDESIGN_NOTES.md`.

## 10. Principles

1. Brand through restraint: coral appears where it carries meaning (action, location, identity).
2. Information first: real data, no decorative filler, no invented figures or imagery.
3. One system: no page-local styles for shared components.
4. Accessible by default: AA contrast for text, visible focus, 44-px targets, reduced-motion support.
5. Machine vs human: AI-generated content is always visibly labelled; a human sends everything.
