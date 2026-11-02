const MS_PER_DAY = 86_400_000;

/** Whole days between two dates (a -> b), floored. */
export const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / MS_PER_DAY);

/** Whole months between two dates (approximate, calendar based). */
export function monthsBetween(a, b) {
  const from = new Date(a);
  const to = new Date(b);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(months, 0);
}

export const addDays = (date, days) => new Date(new Date(date).getTime() + days * MS_PER_DAY);

/** "14 November 2026" - unambiguous for both Indian and US readers. */
export function formatDate(date) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export const isoDate = (date) => new Date(date).toISOString().slice(0, 10);

/** Indian-style rupee formatting: 1,23,456 */
export const formatInr = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
