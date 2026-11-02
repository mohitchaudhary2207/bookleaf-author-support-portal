export const inr = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;

export function formatDate(iso, { time = false } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return time ? `${date}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : date;
}

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '—';
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}

/** Compact age for the queue: "5h", "3d". */
export function ageLabel(hours) {
  if (hours < 1) return '<1h';
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export const formatBytes = (n) => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1_048_576).toFixed(1)} MB`);

export const firstName = (name = '') => name.replace(/\s*\(.*\)\s*$/, '').split(' ')[0];

/** First-response SLA for the queue: overdue / due-in / done. Returns { tone, label }. */
export function slaState(sla, firstResponseAt, status, now = Date.now()) {
  if (['Resolved', 'Closed'].includes(status)) return { tone: 'done', label: 'Closed out' };
  if (!sla.waitingForFirstResponse) return { tone: 'ok', label: firstResponseAt ? 'Replied' : '—' };
  const hours = Math.round((new Date(sla.dueAt).getTime() - now) / 3_600_000);
  if (sla.overdue) return { tone: 'overdue', label: `Overdue ${ageLabel(Math.abs(hours))}` };
  return { tone: hours <= 4 ? 'soon' : 'ok', label: hours < 1 ? 'Due <1h' : `Due in ${ageLabel(hours)}` };
}
