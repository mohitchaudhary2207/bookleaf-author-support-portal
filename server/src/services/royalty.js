import { ROYALTY_POLICY } from '../config/constants.js';
import { addDays, formatDate, isoDate, monthsBetween } from '../utils/dates.js';

/**
 * Deterministic royalty-cycle maths. These facts are computed in code and handed to the LLM,
 * so the model never has to do date arithmetic (which it can get subtly wrong).
 *
 * Assumption (documented in README): "quarterly" means calendar quarters, which end on
 * 31 Mar / 30 Jun / 30 Sep / 31 Dec. Royalties for a quarter are paid within 45 days of it ending.
 */
const QUARTER_END = [[2, 31], [5, 30], [8, 30], [11, 31]]; // [monthIndex, day]

function quarterEndsAround(today) {
  const y = today.getUTCFullYear();
  const candidates = [];
  for (const year of [y - 1, y, y + 1]) {
    for (const [m, d] of QUARTER_END) candidates.push(new Date(Date.UTC(year, m, d)));
  }
  const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const last = [...candidates].reverse().find((c) => c < startOfToday);
  const next = candidates.find((c) => c >= startOfToday);
  return { last, next };
}

/** Calendar of the current royalty cycle relative to `now`. */
export function royaltyCycle(now = new Date()) {
  const { last, next } = quarterEndsAround(now);
  const lastDeadline = addDays(last, ROYALTY_POLICY.payoutWindowDays);
  const nextDeadline = addDays(next, ROYALTY_POLICY.payoutWindowDays);
  const lastPayoutStillAhead = now <= lastDeadline;
  return {
    lastQuarterEnd: last,
    lastQuarterPayoutDeadline: lastDeadline,
    nextQuarterEnd: next,
    nextQuarterPayoutDeadline: nextDeadline,
    // The date the author should be told to expect their next payout by.
    nextPayoutBy: lastPayoutStillAhead ? lastDeadline : nextDeadline,
    lastPayoutStillAhead,
  };
}

/**
 * Royalty situation for one published book - the facts a support rep needs to answer
 * "where is my money?" accurately. Pure function of (book, now).
 */
export function royaltyStatus(book, now = new Date()) {
  const cycle = royaltyCycle(now);
  const pending = Number(book.royalty_pending ?? 0);
  const paid = Number(book.royalty_paid ?? 0);
  const isLive = book.status?.startsWith('Published') && book.publication_date;
  const monthsLive = isLive ? monthsBetween(book.publication_date, now) : 0;
  const lastPayout = book.last_royalty_payout_date ? new Date(book.last_royalty_payout_date) : null;

  let situation;
  if (!isLive) situation = 'not_live';
  else if (book.total_copies_sold === 0) situation = 'no_sales';
  else if (pending === 0) situation = 'fully_paid';
  else if (pending < ROYALTY_POLICY.minPayoutInr) situation = 'below_threshold';
  // Selling for 2+ quarters with earnings above the threshold but nothing ever paid: not normal.
  else if (paid === 0 && monthsLive >= 6) situation = 'long_unpaid';
  else if (!cycle.lastPayoutStillAhead && (!lastPayout || lastPayout < cycle.lastQuarterEnd)) situation = 'possibly_overdue';
  else situation = 'payout_scheduled';

  return {
    situation,
    pending,
    paid,
    monthsLive,
    neverPaid: isLive && paid === 0 && book.total_copies_sold > 0,
    belowThreshold: pending > 0 && pending < ROYALTY_POLICY.minPayoutInr,
    shortfallToThreshold: Math.max(ROYALTY_POLICY.minPayoutInr - pending, 0),
    cycle,
  };
}

export const describeCycle = (cycle) => ({
  last_quarter_end: isoDate(cycle.lastQuarterEnd),
  last_quarter_payout_deadline: formatDate(cycle.lastQuarterPayoutDeadline),
  next_quarter_end: isoDate(cycle.nextQuarterEnd),
  next_payout_by: formatDate(cycle.nextPayoutBy),
});
