import { CATEGORIES } from '../../config/constants.js';

/**
 * BookLeaf knowledge base, split into small sections so a prompt only carries what the ticket
 * needs (cost awareness): a royalty ticket does not pay tokens for printing policy.
 */
export const KB_SECTIONS = {
  company: `COMPANY
- BookLeaf Publishing is a self-publishing company operating in India and the US.
- Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid, with marketing and distribution add-ons).
- We handle cover design, typesetting, ISBN assignment, printing, distribution and royalty management.
- In-house printing facility and warehouse are in Delhi. Print partners: Repro India and Epitome Books.`,

  royalty: `ROYALTY POLICY
- 80/20 split: 80% of net profit per book goes to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of the quarter ending.
- Minimum payout threshold: Rs 1,000. Below that, royalties roll over to the next quarter.
- Payouts are by bank transfer to the account linked in the author's dashboard.
- Authors can see a detailed royalty breakdown (sales per platform) in their dashboard.`,

  isbn: `ISBN POLICY
- Every book gets a unique ISBN assigned by BookLeaf, registered under BookLeaf's publisher imprint.
- An author who wants an ISBN under their own imprint must obtain it independently.
- ISBN errors (duplicate, wrong book linked) are HIGH PRIORITY and are escalated to the production team.
- Metadata updates (description, bio, categories) can be submitted via the dashboard or by emailing the team; they reflect on platforms within 3-5 business days.`,

  printing: `PRINTING & QUALITY
- In-house printing handles most orders; overflow or specific formats go to Repro India or Epitome Books.
- Standard print turnaround: 5-7 business days from order confirmation.
- Quality issues (misprints, binding defects, colour inconsistency): BookLeaf arranges a FREE reprint after verification. The author may need to share photos of the defective copy.`,

  distribution: `DISTRIBUTION & AVAILABILITY
- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.
- New listings typically go live 7-10 business days after publication is complete.
- A book showing as unavailable on a platform is usually a stock sync issue; the team can trigger a re-sync, which takes 24-48 hours.`,

  production: `PRODUCTION STAGES
- Manuscript Received > Editing (if opted) > Cover Design > Typesetting > Proofreading > ISBN Assignment > Printing > Distribution Setup > Published & Live.
- Authors are emailed at each stage. Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).`,

  tone: `TONE GUIDELINES (how BookLeaf talks to authors)
- Empathetic and professional. Authors are partners, not customers to be managed.
- Acknowledge the concern BEFORE jumping to solutions.
- Be specific: use actual numbers, dates and statuses instead of vague reassurance.
- If it is BookLeaf's fault (delayed royalties, ISBN error), own it directly. No corporate deflection.
- If it needs escalation or investigation, give a clear timeline (e.g. "within 48 hours"), never an open-ended promise.
- Always end with a clear next step for the author and/or the BookLeaf team.`,
};

/** Which policy sections are relevant for each ticket category. Tone is always included. */
export const CATEGORY_SECTIONS = {
  'Royalty & Payments': ['royalty', 'company'],
  'ISBN & Metadata Issues': ['isbn'],
  'Printing & Quality': ['printing', 'company'],
  'Distribution & Availability': ['distribution'],
  'Book Status & Production Updates': ['production'],
  // General questions can be about anything: give the compact full set.
  'General Inquiry': ['company', 'royalty', 'isbn', 'printing', 'distribution', 'production'],
};

/** Calibration examples from the brief: query -> how the reply should be framed. */
export const EXAMPLES = {
  'Royalty & Payments': [
    {
      query: 'I published my book 4 months ago and still haven\'t received any royalty. What\'s going on?',
      guidance: 'Acknowledge the frustration. Explain the quarterly royalty cycle and 45-day payout window. Check bank details are linked. Give the specific next payout date. If genuinely overdue, escalate with a 48-hour resolution timeline.',
    },
    {
      query: 'My royalty amount seems too low. I sold 200 copies but only received Rs 3,000.',
      guidance: 'Explain the net profit calculation (MRP minus printing, platform commission, shipping). Offer a detailed line-by-line royalty breakdown. Do not be defensive - offer transparency.',
    },
  ],
  'ISBN & Metadata Issues': [
    {
      query: 'My book is showing a different ISBN on Amazon than what\'s on the physical copy.',
      guidance: 'Treat as high priority. Acknowledge this is a serious data issue. Confirm you are escalating to the production team immediately. Provide a 48-hour resolution timeline.',
    },
  ],
  'Printing & Quality': [
    {
      query: 'I received my author copies and the print quality is terrible. Images are blurry and pages are misaligned.',
      guidance: 'Apologise sincerely. Ask the author to share photos of the defective copies. Confirm BookLeaf will arrange a free reprint once verified. Provide a 5-7 business day reprint timeline.',
    },
  ],
  'Distribution & Availability': [
    {
      query: 'My book is published but it\'s showing as "Currently Unavailable" on Amazon.',
      guidance: 'Explain this is typically a stock sync issue. Confirm you are triggering a re-sync with the distribution team. Set expectation: 24-48 hours to go live again.',
    },
  ],
  'Book Status & Production Updates': [
    {
      query: 'It\'s been 3 weeks and my book is still in typesetting. When will it be done?',
      guidance: 'Check the actual production status. If delayed, be honest about why (e.g. waiting on author approval for proofs). Give a specific updated timeline. Do not blame the author even if the delay is on their side - frame it collaboratively.',
    },
  ],
  'General Inquiry': [
    {
      query: 'Can I update the description of my book on Amazon after it\'s already live?',
      guidance: 'Yes - metadata updates can be submitted through the dashboard or by emailing the BookLeaf team. Changes typically reflect on platforms within 3-5 business days.',
    },
  ],
};

export const CATEGORY_DEFINITIONS = {
  'Royalty & Payments': 'Royalty amounts, calculation, payout timing or missing payments, bank details, minimum payout threshold, sales figures vs earnings.',
  'ISBN & Metadata Issues': 'Wrong/duplicate/mismatched ISBN, wrong book linked, incorrect title/author/description/categories on a listing, requests to change metadata.',
  'Printing & Quality': 'Print defects (blurry, misaligned, binding, colour), damaged copies, author copies, reprints, print turnaround, paper/cover finish.',
  'Distribution & Availability': 'Book unavailable/out of stock or missing on Amazon/Flipkart/the BookLeaf Store, listing not live yet, platform expansion (US/UK), stock sync.',
  'Book Status & Production Updates': 'Where a book is in production (editing, cover, typesetting, proofreading, ISBN, printing), delays, timelines, proof/cover approvals.',
  'General Inquiry': 'Anything else: how things work, packages, account questions, bio updates, feedback, anything not clearly in the categories above.',
};

export const assertCategoryCoverage = () => {
  for (const c of CATEGORIES) {
    if (!CATEGORY_SECTIONS[c] || !CATEGORY_DEFINITIONS[c]) throw new Error(`Knowledge base missing category: ${c}`);
  }
};
assertCategoryCoverage();

/** Knowledge-base text for one category: tone + relevant policy sections + calibration examples. */
export function knowledgeFor(category) {
  const key = CATEGORIES.includes(category) ? category : 'General Inquiry';
  const sections = CATEGORY_SECTIONS[key].map((s) => KB_SECTIONS[s]);
  const examples = (EXAMPLES[key] || [])
    .map((e, i) => `Example ${i + 1}\n  Author asks: "${e.query}"\n  Good reply approach: ${e.guidance}`)
    .join('\n');
  return [KB_SECTIONS.tone, ...sections, examples && `CALIBRATION EXAMPLES\n${examples}`].filter(Boolean).join('\n\n');
}
