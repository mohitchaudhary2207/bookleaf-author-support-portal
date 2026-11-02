const slug = (s) => String(s ?? 'none').toLowerCase().replace(/[^a-z]+/g, '-');

export const StatusBadge = ({ status }) => <span className={`badge status-${slug(status)}`}>{status}</span>;

export const PriorityBadge = ({ priority }) => (
  priority ? <span className={`badge prio-${slug(priority)}`}>{priority}</span> : <span className="badge prio-none">Scoring…</span>
);

const CATEGORY_SHORT = {
  'Royalty & Payments': 'Royalty',
  'ISBN & Metadata Issues': 'ISBN / Metadata',
  'Printing & Quality': 'Printing',
  'Distribution & Availability': 'Distribution',
  'Book Status & Production Updates': 'Production',
  'General Inquiry': 'General',
};

export const CategoryBadge = ({ category, full = false }) => (
  category
    ? <span className="badge cat" title={category}>{full ? category : CATEGORY_SHORT[category] ?? category}</span>
    : <span className="badge prio-none">Classifying…</span>
);

const SOURCE = {
  ai: { label: 'AI', hint: 'Set by the AI model' },
  rules: { label: 'Rules', hint: 'AI was unavailable - set by keyword rules. Please review.' },
  admin: { label: 'Manual', hint: 'Overridden by an admin' },
  pending: { label: '…', hint: 'Waiting for AI triage' },
};

/** Small tag showing who decided a value: the model, the fallback rules, or a human. */
export const SourceTag = ({ source }) => {
  const s = SOURCE[source] ?? SOURCE.pending;
  return <span className={`source source-${source}`} title={s.hint}>{s.label}</span>;
};
