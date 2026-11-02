import { PRIORITIES } from '../../config/constants.js';

/**
 * Deterministic keyword triage. This is the graceful-degradation path: when the LLM is
 * unavailable (outage, rate limit, no API key) tickets are still categorised and prioritised so
 * the queue stays usable. It is deliberately simple and conservative - admins can override it,
 * and a ticket triaged this way is labelled source = 'rules' so the UI says so.
 */
const CATEGORY_PATTERNS = {
  'Royalty & Payments': [/royalt/, /payout|payment|paid|unpaid|\bpay\b/, /bank|neft|account number|ifsc/, /earning|earned|commission/, /sales (figure|report)|copies sold/, /haven'?t (been )?(received|paid)|not (been )?(received|paid)/, /too low|less than expected|amount (seems|is)/],
  'ISBN & Metadata Issues': [/isbn/, /metadata/, /wrong (title|author|description|cover|category)/, /duplicate (listing|book|isbn)/, /(change|update|edit|correct).{0,25}(description|bio|title|category|blurb)/, /different (isbn|title)/],
  'Printing & Quality': [/print(ed|ing)?\b/, /quality/, /blurry|misalign|misprint|smudg|faded|colou?r/, /binding|pages? (fell|falling|torn|missing)|damaged|defect/, /author copies|reprint|paper/],
  'Distribution & Availability': [/unavailable|out of stock|not available|not showing|can'?t find|cannot find/, /amazon|flipkart|store|listing|listed|platform/, /distribution|stock sync|re-?sync|available (on|in)/],
  'Book Status & Production Updates': [/status|progress|timeline|how long|when will|eta|delay(ed)?/, /typesett|proofread|cover design|editing|manuscript|proof\b|production|launch date/],
  'General Inquiry': [/package|bestseller breakthrough|standard free|how (do|can|does)|can i|is it possible|feedback|suggest/],
};

const CRITICAL = [/legal|lawyer|advocate|sue\b|court|fraud|scam|cheat(ed|ing)|police|consumer forum|defam/, /social media|twitter|public(ly)? (post|review)|press|journalist|media/, /charge ?back|money back|refund.*(everything|full)/, /all platforms?.{0,20}(unavailable|missing|down)/];
const URGENT = [/urgent|asap|immediately|right away|emergency|desperate/];
const DEFECT = [/terrible|defect|misprint|blurry|misalign|damaged|torn|faded|falling apart|wrong (book|cover)|poor quality|bad quality/];
const UNAVAILABLE = [/unavailable|out of stock|not available|not showing|can'?t find|delisted|removed from/];
const COMPLAINT = [/not (yet )?(received|paid|credited)|haven'?t (yet )?(received|been paid)|missing|too low|wrong|incorrect|never (received|got)|still waiting|still (not|no)/];
const LOW = [/\b(can|could) i\b|is it possible|how (do|can|does)|bio\b|author bio|description|update my|suggest|feedback|just (wanted|curious)|information about/];

const matches = (patterns, text) => patterns.filter((p) => p.test(text)).length;
const rank = (p) => PRIORITIES.indexOf(p);
const atLeast = (current, floor) => (rank(floor) < rank(current) ? floor : current);
const bump = (p) => PRIORITIES[Math.max(rank(p) - 1, 0)];

/** Largest "N months/years" duration mentioned (in months) - long waits raise urgency. */
function mentionedMonths(text) {
  let max = 0;
  for (const m of text.matchAll(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(month|year|week)s?/g)) {
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
    const n = Number.isNaN(Number(m[1])) ? words[m[1]] : Number(m[1]);
    const months = m[2] === 'year' ? n * 12 : m[2] === 'week' ? n / 4.3 : n;
    max = Math.max(max, months);
  }
  return max;
}

export function ruleBasedTriage({ subject = '', description = '' }) {
  const subj = subject.toLowerCase();
  const text = `${subject}\n${description}`.toLowerCase();

  // Score each category; subject hits count double (authors put the real ask in the subject).
  const scores = Object.entries(CATEGORY_PATTERNS).map(([category, patterns]) => ({
    category,
    score: matches(patterns, text) + matches(patterns, subj),
  }));
  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  const category = best.score > 0 ? best.category : 'General Inquiry';
  const confidence = best.score === 0 ? 0.3 : Math.min(0.35 + 0.1 * (best.score - (second?.score ?? 0)), 0.7);

  let priority = {
    'Royalty & Payments': matches(COMPLAINT, text) ? 'High' : 'Medium',
    'ISBN & Metadata Issues': /isbn/.test(text) ? 'High' : 'Low',
    'Printing & Quality': matches(DEFECT, text) ? 'High' : 'Medium',
    'Distribution & Availability': matches(UNAVAILABLE, text) ? 'High' : 'Medium',
    'Book Status & Production Updates': 'Medium',
    'General Inquiry': matches(LOW, text) ? 'Low' : 'Medium',
  }[category];

  const months = mentionedMonths(text);
  if (months >= 6 && ['Royalty & Payments', 'Book Status & Production Updates'].includes(category)) priority = atLeast(priority, 'Critical');
  else if (months >= 3 && category !== 'General Inquiry') priority = bump(priority);

  if (matches(CRITICAL, text)) priority = 'Critical';
  else if (matches(URGENT, text)) priority = bump(priority);

  return {
    category,
    priority,
    confidence: Number(confidence.toFixed(2)),
    rationale: 'Keyword-based triage (AI unavailable). Please review.',
    source: 'rules',
  };
}
