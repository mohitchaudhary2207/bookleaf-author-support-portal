import { royaltyStatus } from '../royalty.js';
import { formatDate, formatInr } from '../../utils/dates.js';

/**
 * Template drafts: the degraded-mode counterpart to the LLM draft. They are built from the same
 * knowledge-base policy and the same computed facts, so an admin gets a sensible, accurate
 * starting point even when the AI API is down. Wording follows the BookLeaf tone guide
 * (acknowledge first, be specific, own mistakes, give a timeline, end with a next step).
 */
const first = (name = '') => String(name).trim().split(/\s+/)[0] || 'there';
const sign = (responder) => `Warm regards,\n${responder}\nBookLeaf Support`;

const bookRef = (book) => (book ? `"${book.title}"` : 'your account');

function royalty({ book, books, now }) {
  const subject = book ?? books.find((b) => String(b.status).startsWith('Published'));
  const notes = ['Confirm the author\'s bank details are linked in the dashboard.'];
  if (!subject) {
    return { notes, text: `Thank you for asking about your royalties. Royalties are calculated quarterly and paid within 45 days of the quarter ending, to the bank account linked in your dashboard. I do not see a published book on your account yet, so no royalty has accrued - once your book is live, you will see sales and earnings in your dashboard.\n\nIf you expected a payout, tell me which book you mean and I will look into it within 48 hours.` };
  }
  const rs = royaltyStatus(subject, now);
  const base = `I'm sorry for the worry around ${bookRef(subject)} - I can see why you want a clear answer, so here is exactly where things stand.`;
  const by = formatDate(rs.cycle.nextPayoutBy);
  const cases = {
    payout_scheduled: `Your pending royalty is ${formatInr(rs.pending)}. Royalties are calculated quarterly and paid within 45 days of the quarter ending, so this will be paid by ${by} to the bank account linked in your dashboard.\n\nNext step: please confirm your bank details in the dashboard are correct, and we will take care of the rest.`,
    below_threshold: `Your pending royalty is ${formatInr(rs.pending)}, which is below our ${formatInr(1000)} minimum payout. It rolls over to the next quarter automatically and will be paid once the balance passes ${formatInr(1000)} - you are ${formatInr(rs.shortfallToThreshold)} away.\n\nNext step: nothing needed from you; you can see the per-platform breakdown in your dashboard.`,
    fully_paid: `Our records show all royalty earned on this book (${formatInr(subject.total_royalty_earned)}) has been paid, with the last payout on ${formatDate(subject.last_royalty_payout_date)}.\n\nNext step: if the amount looks different from what you expected, I can share a line-by-line royalty breakdown (MRP minus printing cost, platform commission and shipping, split 80/20) - just say the word.`,
    no_sales: 'No sales have been recorded for this book yet, so no royalty has accrued. Sales appear in your dashboard as soon as they are reported by the platforms.\n\nNext step: tell us if you expected sales to have been recorded and we will check with the distribution team within 48 hours.',
    not_live: 'This book has not been published yet, so there are no sales or royalties to pay out so far.\n\nNext step: we will email you at each production stage; reply here if you would like a status update.',
    long_unpaid: `Your book has been live for ${rs.monthsLive} months with ${formatInr(rs.pending)} in pending royalties and no payout so far. That is not the experience we want for you, and the delay is on our side.\n\nI am escalating this to our finance team right now and we will come back to you with a confirmed payout date within 48 hours.\n\nNext step: please double-check the bank details linked in your dashboard so there is nothing to hold up the transfer.`,
    possibly_overdue: `Your pending royalty of ${formatInr(rs.pending)} should already have been paid, and I apologise for the delay - that is on us.\n\nI am escalating this to our finance team right now and we will confirm the payout date within 48 hours.\n\nNext step: please double-check the bank details linked in your dashboard.`,
  };
  if (['long_unpaid', 'possibly_overdue'].includes(rs.situation)) notes.push('Genuinely overdue: escalate to finance and confirm the 48-hour timeline.');
  return { notes, text: `${base}\n\n${cases[rs.situation]}` };
}

const BUILDERS = {
  'Royalty & Payments': royalty,

  'ISBN & Metadata Issues': ({ book }) => ({
    notes: ['Escalate to the production team now (ISBN errors are high priority).'],
    text: `Thank you for flagging this - an ISBN or metadata mismatch on ${bookRef(book)} is a serious data issue and we are treating it as high priority.\n\nI am escalating it to our production team immediately, and we will confirm the fix or the root cause within 48 hours. Metadata corrections typically reflect on the platforms within 3-5 business days after that.\n\nNext step: it would help if you could share a screenshot of the listing and a photo of the ISBN on your physical copy.`,
  }),

  'Printing & Quality': ({ book }) => ({
    notes: ['Verify the photos before approving the free reprint.'],
    text: `I'm truly sorry that your copies of ${bookRef(book)} did not meet the quality you deserve - that is not the standard we hold ourselves to.\n\nWe will arrange a free reprint once we have verified the issue. Could you please share clear photos of the defective copies (the affected pages, binding and cover)?\n\nNext step: once we have the photos, the reprint is dispatched with a 5-7 business day turnaround.`,
  }),

  'Distribution & Availability': ({ book }) => ({
    notes: ['Trigger a stock re-sync with the distribution team.'],
    text: `Thank you for letting us know - ${bookRef(book)} showing as unavailable is frustrating, and we want it back on sale quickly.\n\nThis is usually a stock sync issue between our warehouse and the platform. I am triggering a re-sync with our distribution team now, and the listing should be back within 24-48 hours.\n\nNext step: if it is still showing as unavailable after 48 hours, reply here and we will escalate it directly.`,
  }),

  'Book Status & Production Updates': ({ book }) => {
    const stage = book && !String(book.status).startsWith('Published') ? book.status.replace('In Production - ', '') : null;
    return {
      notes: ['Check the real production status and whether the delay is waiting on the author\'s approval; then add a specific date.'],
      text: `Thank you for checking in on ${bookRef(book)} - I know waiting without clear dates is hard.\n\n${stage ? `Your book is currently in ${stage}. ` : ''}Delays most often happen at cover design (while we wait for approvals) and proofreading (revision rounds), and we will work through it together with you. I am checking exactly where things stand with the production team and will send you a specific updated timeline within 48 hours.\n\nNext step: keep an eye on your inbox for the update - we will also email you at every stage.`,
    };
  },

  'General Inquiry': () => ({
    notes: ['Replace this holding reply with the specific answer.'],
    text: `Thank you for getting in touch. I want to make sure you get a precise answer, so I am looking into your question and will come back to you within 48 hours.\n\nIf it is about updating your book's details, metadata changes can be submitted through your dashboard or by emailing our team, and they typically reflect on the platforms within 3-5 business days.\n\nNext step: reply here with any extra detail that would help us.`,
  }),
};

export function buildTemplateDraft({ category, author, book, books, responderName, now = new Date() }) {
  const build = BUILDERS[category] ?? BUILDERS['General Inquiry'];
  const { text, notes } = build({ author, book, books, now });
  return {
    reply: `Hi ${first(author.name)},\n\n${text}\n\n${sign(responderName)}`,
    admin_notes: notes,
  };
}
