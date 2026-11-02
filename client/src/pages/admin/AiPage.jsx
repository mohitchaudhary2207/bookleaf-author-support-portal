import { api } from '../../api/client.js';
import { useFetch } from '../../api/hooks.js';
import { Card, ErrorState, PageHeader, Spinner } from '../../components/Common.jsx';
import { formatDate } from '../../utils/format.js';

const REASONS = {
  disabled: 'AI is switched off (AI_ENABLED=false).',
  // quota / auth problems surface as failures below; see the recent-failures list
  not_configured: 'No OPENAI_API_KEY is configured - running in manual mode.',
  cooling_down: 'The AI provider failed repeatedly; calls are paused briefly (circuit breaker) and fall back to rules/templates.',
};

export default function AiPage() {
  const { data, error, loading, reload } = useFetch(() => api.get('/admin/ai/usage'), []);
  if (loading) return <Spinner />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;

  const { totals, byPurpose, recentErrors, status, estimatedCostUsd } = data;
  const cacheShare = totals.inputTokens + totals.cacheReadTokens > 0 ? Math.round((totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens)) * 100) : 0;

  return (
    <div className="page">
      <PageHeader title="AI &amp; usage" subtitle="How AI assistance is behaving and what it costs.">
        <button className="btn" onClick={reload}>Refresh</button>
      </PageHeader>

      <div className={`alert ${status.available ? 'alert-ok' : 'alert-warn'}`}>
        <strong>{status.available ? 'AI assistance is active.' : 'AI assistance is currently unavailable.'}</strong>{' '}
        {status.available ? 'New tickets are classified by the model and drafts are generated on demand.' : `${REASONS[status.reason] ?? ''} Tickets are still created and triaged by keyword rules, and drafts come from policy templates - you can always write replies manually.`}
      </div>

      <div className="tiles">
        <div className="tile"><span className="label">LLM calls</span><strong>{totals.calls}</strong><small>{totals.failed} failed</small></div>
        <div className="tile"><span className="label">Input tokens</span><strong>{totals.inputTokens.toLocaleString('en-IN')}</strong><small>{cacheShare}% served from prompt cache</small></div>
        <div className="tile"><span className="label">Output tokens</span><strong>{totals.outputTokens.toLocaleString('en-IN')}</strong></div>
        <div className="tile"><span className="label">Avg latency</span><strong>{Math.round(totals.avgLatencyMs)} ms</strong></div>
        <div className="tile tile-accent"><span className="label">Estimated spend</span><strong>${estimatedCostUsd.toFixed(4)}</strong><small>at list price</small></div>
      </div>

      <div className="two-col">
        <Card title="By purpose">
          <table className="plain">
            <thead><tr><th>Purpose</th><th>Calls</th><th>Input tok</th><th>Output tok</th><th>Avg in / call</th></tr></thead>
            <tbody>
              {byPurpose.length === 0 && <tr><td colSpan="5" className="muted">No AI calls yet.</td></tr>}
              {byPurpose.map((p) => (
                <tr key={p.purpose}><td>{p.purpose === 'classify' ? 'Classify + prioritise' : 'Draft reply'}</td><td>{p.calls}</td><td>{p.inputTokens.toLocaleString('en-IN')}</td><td>{p.outputTokens.toLocaleString('en-IN')}</td><td>{p.calls ? Math.round(p.inputTokens / p.calls) : 0}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Recent failures">
          {recentErrors.length === 0 ? <p className="muted">No failures recorded 🎉</p> : (
            <ul className="plain-list">
              {recentErrors.map((e, i) => <li key={i}><span className="muted small">{formatDate(e.createdAt, { time: true })}</span> · {e.purpose}<br /><code>{e.error}</code></li>)}
            </ul>
          )}
        </Card>
      </div>

      <Card title="How the AI is used (and kept cheap)">
        <ul className="tips">
          <li><strong>One call classifies and prioritises</strong> a new ticket - it only sees the ticket text and a one-line book summary, never the knowledge base or history.</li>
          <li><strong>Drafts are generated lazily</strong> when an admin opens a ticket, cached until the conversation changes, and de-duplicated if two admins open it at once.</li>
          <li><strong>Only the relevant policy sections</strong> for the ticket's category are sent, plus facts about the one book in question and the last few messages.</li>
          <li><strong>Dates and amounts are computed in code</strong> (royalty cycle, payout deadline, thresholds) and handed to the model as facts, so it never does date maths.</li>
          <li><strong>Graceful degradation:</strong> if the provider is down or rate-limited, tickets are still created, triaged by keyword rules (tagged "Rules"), and drafts fall back to policy templates.</li>
        </ul>
      </Card>
    </div>
  );
}
