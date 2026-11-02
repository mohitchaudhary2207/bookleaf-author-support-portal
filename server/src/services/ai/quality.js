/**
 * Lightweight, deterministic quality gate for AI-drafted replies. It runs on every generated draft BEFORE an admin
 * sees it; a failing draft gets at most one corrective regeneration and is then replaced by the policy template
 * (see aiService.draft). It never sends anything and never edits text - it only accepts or rejects.
 *
 * What it enforces (each maps to a rule in the draft prompt / BookLeaf tone guide):
 *   - greeting "Hi <first name>," and the exact sign-off "Warm regards, / <responder> / BookLeaf Support"
 *   - none of the stock AI phrases we ban ("I understand ...", "I'm sorry to hear", "Rest assured", ...)
 *   - Printing & Quality replies open with a sincere apology (KB example: "Apologise sincerely")
 *   - every rupee amount and every "14 November 2026"-style date in the reply is present in the facts we supplied
 *     (the model may not invent financial or date information)
 *   - a sane length
 */
export const BANNED_PHRASES = [
  [/\bI understand\b/i, 'uses the stock phrase "I understand ..."'],
  [/\bI(?:'| a)?m sorry to hear\b/i, 'uses the stock phrase "I\'m sorry to hear"'],
  [/\bI am sorry to hear\b/i, 'uses the stock phrase "I am sorry to hear"'],
  [/\bI hope this (?:email |message )?finds you\b/i, 'uses the stock phrase "I hope this finds you well"'],
  [/\bthank you for reaching out\b/i, 'uses the stock phrase "thank you for reaching out"'],
  [/\brest assured\b/i, 'uses the stock phrase "rest assured"'],
  [/\bas an ai\b/i, 'refers to itself as an AI'],
];

const APOLOGY = /\b(?:sincerely apologi[sz]e|apologi[sz]e|apologies|(?:I(?:'|’)m|I am|we(?:'|’)re|we are)\s+(?:truly |so |very |really |deeply |terribly |incredibly )?sorry)\b/i;
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const WORDS = { min: 15, max: 320 };

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeApostrophes = (s) => String(s).replace(/[‘’]/g, "'");
const numbersIn = (text) => new Set([...String(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, '')));

/**
 * @param {object} p
 * @param {string} p.reply          drafted reply text
 * @param {string} p.category       ticket category
 * @param {string} p.authorName     full author name (first name must be greeted)
 * @param {string} p.responderName  name that must appear in the sign-off
 * @param {string} p.groundTruth    everything the reply may legitimately cite: FACTS + knowledge base + the ticket/thread
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkDraftQuality({ reply, category, authorName, responderName, groundTruth = '' }) {
  const problems = [];
  const text = normalizeApostrophes(reply ?? '').trim();
  const firstName = String(authorName ?? '').trim().split(/\s+/)[0];

  if (firstName && !new RegExp(`^Hi ${escapeRe(firstName)},`, 'i').test(text)) problems.push(`does not open with "Hi ${firstName},"`);
  if (!new RegExp(`Warm regards,\\s*\\n\\s*${escapeRe(responderName)}\\s*\\n\\s*BookLeaf Support\\s*$`, 'i').test(text)) {
    problems.push(`does not end with the sign-off "Warm regards, / ${responderName} / BookLeaf Support"`);
  }

  for (const [re, why] of BANNED_PHRASES) if (re.test(text)) problems.push(why);

  if (category === 'Printing & Quality') {
    // First paragraph after the greeting must carry the apology (the greeting is its own paragraph).
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const first = paragraphs[0]?.startsWith('Hi ') ? paragraphs[1] ?? '' : paragraphs[0] ?? '';
    if (!APOLOGY.test(first)) problems.push('a Printing & Quality reply must open with a sincere apology (first paragraph after the greeting)');
  }

  // Grounding: amounts and dates may only come from the supplied facts / KB / ticket text.
  const allowedNumbers = numbersIn(groundTruth);
  for (const m of text.matchAll(/(?:₹|Rs\.?|INR)\s?(\d[\d,]*(?:\.\d+)?)/gi)) {
    if (!allowedNumbers.has(m[1].replace(/,/g, ''))) problems.push(`mentions an amount (${m[0].trim()}) that is not in the supplied facts`);
  }
  const truth = normalizeApostrophes(groundTruth).toLowerCase();
  for (const m of text.matchAll(new RegExp(`\\b\\d{1,2} (?:${MONTHS}) \\d{4}\\b`, 'gi'))) {
    if (!truth.includes(m[0].toLowerCase())) problems.push(`mentions a date (${m[0]}) that is not in the supplied facts`);
  }

  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < WORDS.min) problems.push(`is too short (${words} words)`);
  if (words > WORDS.max) problems.push(`is too long (${words} words)`);

  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}

/** Text appended to the prompt for the single corrective regeneration. */
export const revisionFeedback = (problems) =>
  `\n\nREVISION REQUIRED: your previous draft was rejected by BookLeaf's quality checks because it ${problems.join('; it ')}. ` +
  'Rewrite the COMPLETE reply, fixing every point above, keeping every fact, amount and date exactly as supplied in <facts>, and using the exact sign-off.';
