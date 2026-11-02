// The seven sample author queries from the BookLeaf assignment brief ("Sample Query -> Response Examples"),
// each bound to a seeded author/book so the facts are real, plus what a good triage + reply must satisfy.
//
//   category      : expected category (exact)
//   priorities    : acceptable priorities ("plausible")
//   mustMatch     : regexes the reply must satisfy (policy content / required timeline from the brief's guidance)
//   mustNotMatch  : regexes the reply must NOT contain (invented promises)
// Generic tone / grounding rules (no stock phrases, signature, no invented amounts or dates, printing apology)
// are enforced for every sample by services/ai/quality.js.

export const SAMPLES = [
  {
    id: 'royalty-none-received',
    author: 'ananya.reddy@email.com',
    bookId: 'BK005',
    subject: 'No royalty received yet',
    description: "I published my book 4 months ago and still haven't received any royalty. What's going on?",
    category: 'Royalty & Payments',
    priorities: ['Critical', 'High', 'Medium'],
    mustMatch: [[/48 hours/i, 'gives the 48-hour escalation timeline'], [/finance|escalat/i, 'escalates the overdue payment'], [/bank/i, 'asks about the linked bank details']],
    mustNotMatch: [[/refund|compensation/i, 'promises a refund or compensation']],
  },
  {
    id: 'royalty-too-low',
    author: 'priya.sharma@email.com',
    bookId: 'BK001',
    subject: 'My royalty amount seems too low',
    description: 'My royalty amount seems too low. I sold 200 copies but only received ₹3,000.',
    category: 'Royalty & Payments',
    priorities: ['Medium', 'High'],
    mustMatch: [[/MRP/i, 'explains net profit starts from MRP'], [/printing/i, 'mentions printing cost'], [/commission/i, 'mentions platform commission'], [/shipping/i, 'mentions shipping'], [/breakdown|line-by-line/i, 'offers a detailed breakdown']],
    mustNotMatch: [[/\bour mistake\b|\bwe underpaid\b/i, 'admits an underpayment without evidence']],
  },
  {
    id: 'isbn-mismatch',
    author: 'rohit.kapoor@email.com',
    bookId: 'BK003',
    subject: 'Different ISBN on Amazon',
    description: "My book is showing a different ISBN on Amazon than what's on the physical copy.",
    category: 'ISBN & Metadata Issues',
    priorities: ['High', 'Critical'],
    mustMatch: [[/production team/i, 'escalates to the production team'], [/48 hours/i, 'gives the 48-hour resolution timeline']],
    mustNotMatch: [],
  },
  {
    id: 'print-quality',
    author: 'rohit.kapoor@email.com',
    bookId: 'BK004',
    subject: 'Print quality is terrible',
    description: 'I received my author copies and the print quality is terrible. The images are blurry and pages are misaligned.',
    category: 'Printing & Quality',
    priorities: ['High', 'Critical', 'Medium'],
    mustMatch: [[/photo/i, 'asks for photos of the defective copies'], [/reprint/i, 'confirms a free reprint after verification'], [/5\s*(?:-|–|to)\s*7 business days?/i, 'gives the 5-7 business day reprint timeline']],
    mustNotMatch: [],
  },
  {
    id: 'amazon-unavailable',
    author: 'priya.sharma@email.com',
    bookId: 'BK002',
    subject: 'Currently Unavailable on Amazon',
    description: 'My book is published but it\'s showing as "Currently Unavailable" on Amazon.',
    category: 'Distribution & Availability',
    priorities: ['High', 'Medium', 'Critical'],
    mustMatch: [[/sync/i, 'explains it is typically a stock sync issue'], [/24\s*(?:-|–|to)\s*48 hours/i, 'sets the 24-48 hour expectation']],
    mustNotMatch: [],
  },
  {
    id: 'stuck-in-production',
    author: 'sneha.kulkarni@email.com',
    bookId: 'BK013',
    subject: 'Still in production',
    description: "It's been 3 weeks and my book is still in cover design. When will it be done?",
    category: 'Book Status & Production Updates',
    priorities: ['Medium', 'High'],
    mustMatch: [[/cover design/i, 'states the real production stage'], [/48 hours|within/i, 'gives a bounded timeline instead of an open-ended promise']],
    mustNotMatch: [[/\byour (?:delay|fault)\b|because you/i, 'blames the author']],
  },
  {
    id: 'update-description',
    author: 'priya.sharma@email.com',
    bookId: 'BK001',
    subject: 'Can I update my book description?',
    description: "Can I update the description of my book on Amazon after it's already live?",
    category: 'General Inquiry',
    priorities: ['Low', 'Medium'],
    mustMatch: [[/dashboard/i, 'mentions submitting through the dashboard'], [/e-?mail/i, 'mentions e-mailing the team'], [/3\s*(?:-|–|to)\s*5 business days?/i, 'gives the 3-5 business day timeline']],
    mustNotMatch: [],
  },
];

/** Check one reply against a sample's content expectations. Returns an array of failure descriptions. */
export function checkReplyContent(sample, reply) {
  const failures = [];
  for (const [re, label] of sample.mustMatch) if (!re.test(reply)) failures.push(`missing: ${label}`);
  for (const [re, label] of sample.mustNotMatch) if (re.test(reply)) failures.push(`forbidden: ${label}`);
  return failures;
}
