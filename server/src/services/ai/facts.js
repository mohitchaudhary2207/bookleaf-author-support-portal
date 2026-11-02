import { PRODUCTION_STAGES, ROYALTY_POLICY } from '../../config/constants.js';
import { royaltyCycle, royaltyStatus } from '../royalty.js';
import { formatDate, formatInr, isoDate, monthsBetween } from '../../utils/dates.js';

const ALL_PLATFORMS = ['Amazon India', 'Flipkart', 'Amazon US', 'Amazon UK', 'BookLeaf Store'];

const isLive = (b) => String(b.status).startsWith('Published');

/** One-line, token-cheap description of a book (used for classification context). */
export function bookOneLiner(book, now = new Date()) {
  if (!book) return null;
  if (!isLive(book)) return `"${book.title}" - ${book.status} (not yet published, no sales)`;
  const rs = royaltyStatus(book, now);
  return `"${book.title}" - ${book.status}; live ${rs.monthsLive} months; ${book.total_copies_sold} copies sold; royalty pending ${formatInr(book.royalty_pending)}, paid ${formatInr(book.royalty_paid)}`;
}

/** Full factual description of one book. */
export function describeBook(book, now = new Date()) {
  const lines = [`BOOK: "${book.title}" (${book.book_id})`, `- Status: ${book.status}`, `- Genre: ${book.genre ?? 'n/a'}; ISBN on record: ${book.isbn ?? 'n/a'}`];
  if (!isLive(book)) {
    const stage = PRODUCTION_STAGES.find((s) => book.status.includes(s));
    const idx = stage ? PRODUCTION_STAGES.indexOf(stage) : -1;
    lines.push('- Not yet published: no MRP, sales or royalties exist yet.');
    if (idx >= 0) lines.push(`- Current stage: ${stage} (stage ${idx + 1} of ${PRODUCTION_STAGES.length}). Remaining: ${PRODUCTION_STAGES.slice(idx + 1).join(' > ')}.`);
    lines.push('- Production-stage start dates are NOT in our data: do not state how long the book has been in this stage.');
    return lines.join('\n');
  }
  lines.push(`- Published: ${formatDate(book.publication_date)} (${monthsBetween(book.publication_date, now)} months ago); MRP ${formatInr(book.mrp)}; author royalty per copy ${formatInr(book.author_royalty_per_copy)}`);
  lines.push(`- Sales: ${book.total_copies_sold} copies. Royalty earned ${formatInr(book.total_royalty_earned)}, paid ${formatInr(book.royalty_paid)}, pending ${formatInr(book.royalty_pending)}. Last payout: ${book.last_royalty_payout_date ? formatDate(book.last_royalty_payout_date) : 'none yet'}`);
  lines.push(`- Print partner: ${book.print_partner ?? 'n/a'}; listed on: ${book.available_on.length ? book.available_on.join(', ') : 'nowhere yet'}`);
  return lines.join('\n');
}

const SITUATION_TEXT = {
  not_live: () => 'Book is not published yet, so no royalties accrue.',
  no_sales: () => 'No sales recorded yet, so no royalty has accrued.',
  fully_paid: () => 'All earned royalty has been paid out; nothing pending.',
  below_threshold: (rs) => `Pending ${formatInr(rs.pending)} is BELOW the ${formatInr(ROYALTY_POLICY.minPayoutInr)} minimum payout, so it rolls over to the next quarter; ${formatInr(rs.shortfallToThreshold)} more is needed to trigger payout.`,
  long_unpaid: (rs) => `Live for ${rs.monthsLive} months with ${formatInr(rs.pending)} pending and NOTHING ever paid. This is above the minimum payout and exceeds a normal first-payout delay, so treat it as a genuine BookLeaf delay: own it, escalate to finance, promise resolution within 48 hours. Bank-detail problems are a possible cause.`,
  possibly_overdue: (rs) => `The payout deadline for the quarter ended ${formatDate(rs.cycle.lastQuarterEnd)} (${formatDate(rs.cycle.lastQuarterPayoutDeadline)}) has passed and ${formatInr(rs.pending)} is still pending with no payout since: treat as BookLeaf delay, escalate, 48-hour timeline.`,
  payout_scheduled: (rs) => `${formatInr(rs.pending)} is pending and will be paid in the payout run due by ${formatDate(rs.cycle.nextPayoutBy)}.`,
};

function royaltyFacts(books, book, now) {
  const subject = book ? [book] : books.filter(isLive);
  const cycle = royaltyCycle(now);
  const lines = [
    `ROYALTY CYCLE: today is ${formatDate(now)}. Last quarter ended ${formatDate(cycle.lastQuarterEnd)} (payout due by ${formatDate(cycle.lastQuarterPayoutDeadline)}). Next quarter ends ${formatDate(cycle.nextQuarterEnd)}.`,
    'Bank-account link status is NOT in our data: ask the author to confirm their bank details in the dashboard and add an admin note to verify.',
  ];
  const overdue = subject.some((b) => ['long_unpaid', 'possibly_overdue'].includes(royaltyStatus(b, now).situation));
  // For a genuinely late payment, quoting the regular payout date would contradict "this is our delay".
  if (!overdue) lines.push(`If the author is eligible, tell them their next payout is due by ${formatDate(cycle.nextPayoutBy)}.`);
  else lines.push('A payment is OVERDUE: do NOT quote a regular payout date. Own the delay, escalate, and promise confirmation within 48 hours.');
  for (const b of subject) {
    const rs = royaltyStatus(b, now);
    lines.push(`- "${b.title}": ${SITUATION_TEXT[rs.situation](rs)}`);
  }
  if (!book) lines.push('(The author selected no specific book; the lines above cover all their published books.)');
  return lines;
}

/**
 * Build the FACTS block for the draft prompt. Only facts relevant to the ticket's category are
 * included - this is both a token-cost control and a grounding mechanism: the model is told to
 * use only what is here.
 */
export function buildFacts({ category, author, book, books, now = new Date() }) {
  const parts = [`AUTHOR: ${author.name} (${author.author_id}), ${author.city ?? 'n/a'}; joined ${formatDate(author.joined_date)}`];

  if (book) parts.push(describeBook(book, now));
  else if (books.length) {
    // "General / Account level": give a compact table, capped to keep tokens bounded.
    parts.push(`AUTHOR'S BOOKS (${books.length}):\n${books.slice(0, 8).map((b) => `- ${bookOneLiner(b, now)}`).join('\n')}`);
  } else parts.push('Author has no books on record.');

  const target = book ? [book] : books;
  switch (category) {
    case 'Royalty & Payments':
      parts.push(royaltyFacts(books, book, now).join('\n'));
      break;
    case 'Distribution & Availability':
      for (const b of target.filter(isLive)) {
        const missing = ALL_PLATFORMS.filter((p) => !b.available_on.includes(p));
        parts.push(`LISTING: "${b.title}" is listed on ${b.available_on.join(', ') || 'no platform'}; NOT listed on ${missing.join(', ') || 'none'}. Published ${isoDate(b.publication_date)}. Re-sync takes 24-48 hours; new listings take 7-10 business days.`);
      }
      break;
    case 'Printing & Quality':
      for (const b of target.filter(isLive)) parts.push(`PRINTING: "${b.title}" is printed by ${b.print_partner}. Reprint after verification: 5-7 business days.`);
      break;
    case 'ISBN & Metadata Issues':
      parts.push('ISBN errors are HIGH priority: escalate to the production team and commit to a 48-hour resolution timeline.');
      break;
    case 'Book Status & Production Updates':
      parts.push(`Typical delay points: Cover Design (awaiting author approval) and Proofreading (revision rounds). Whether the delay is on the author's side is NOT in our data - ask the admin to check (admin_notes) rather than assuming. ${target.some((b) => !isLive(b)) ? '' : 'The selected book is already published.'}`.trim());
      break;
    default:
      break;
  }
  return parts.join('\n\n');
}

