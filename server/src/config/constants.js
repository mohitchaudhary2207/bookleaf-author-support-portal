// Single source of truth for domain enums - shared by validation, AI prompts, and the API docs.

export const CATEGORIES = [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
];

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
export const OPEN_STATUSES = ['Open', 'In Progress'];

export const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export const ROLES = { AUTHOR: 'author', ADMIN: 'admin' };

/** Production pipeline, used to render progress for books that are not live yet. */
export const PRODUCTION_STAGES = [
  'Manuscript Received',
  'Editing',
  'Cover Design',
  'Typesetting',
  'Proofreading',
  'ISBN Assignment',
  'Printing',
  'Distribution Setup',
  'Published & Live',
];

/** Royalty policy numbers (from the BookLeaf knowledge base). */
export const ROYALTY_POLICY = {
  minPayoutInr: 1000,
  payoutWindowDays: 45,
};
