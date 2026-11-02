import { CheckCircle2, Coins, Cpu, Gauge, RefreshCw, ShieldAlert, Sparkles, Timer, TriangleAlert } from 'lucide-react';
import { api } from '../../api/client.js';
import { useFetch } from '../../api/hooks.js';
import { Alert, Card, ErrorState, PageHeader, PageSkeleton, Stat } from '../../components/Common.jsx';
import { formatDate } from '../../utils/format.js';

const REASONS = {
  disabled: 'AI is switched off (AI_ENABLED=false).',
  not_configured: 'No OPENAI_API_KEY is configured - running in manual mode.',
  cooling_down: 'The AI provider failed repeatedly; calls are paused briefly (circuit breaker) and fall back to rules/templates.',
};

// Category of the most recent provider failure (never contains credentials or raw provider text).
const FAILURES = {
  auth: 'the provider rejected the API key - check OPENAI_API_KEY',
  quota: 'the AI account is out of quota - check billing',
  rate_limited: 'the provider is rate-limiting requests',
  timeout: 'the provider timed out',
  unavailable: 'the provider could not be reached',
  refused: 'the provider declined a request',
  invalid_response: 'the provider returned an unusable answer',
};

export default function AiPage() {
  const { data, error, loading, reload } = useFetch(() => api.get('/admin/ai/usage'), []);
  if (loading) return <PageSkeleton label="Loading AI usage…" />;
  if (error) return <div className="page"><ErrorState error={error} onRetry={reload} /></div>;

  const { totals, byPurpose, recentErrors, status, estimatedCostUsd } = data;
  const cacheShare = totals.inputTokens + totals.cacheReadTokens > 0 ? Math.round((totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens)) * 100) : 0;

  return (
    <div className="page">
      <PageHeader eyebrow="Support console" title="AI Usage" subtitle="How AI assistance is behaving and what it costs.">
        <button className="btn" onClick={reload}><RefreshCw size={16} />Refresh</button>
      </PageHeader>

      <Alert kind={status.available ? 'ok' : 'warn'}>
        <strong>{status.available ? 'AI assistance is active.' : 'AI assistance is currently unavailable.'}</strong>{' '}
        {status.available ? 'New tickets are classified by the model. Reply drafts are generated only when an admin clicks “Generate AI Response”.' : `${REASONS[status.reason] ?? ''}${status.lastFailure ? ` Last error: ${FAILURES[status.lastFailure.reason] ?? status.lastFailure.reason} (${formatDate(status.lastFailure.at, { time: true })}).` : ''} Tickets are still created and triaged by keyword rules, and drafts come from policy templates - you can always write replies manually.`}
      </Alert>

      <div className="stats">
        <Stat label="LLM calls" value={totals.calls} icon={Cpu} hint={`${totals.failed} failed`} tone={totals.failed ? 'warn' : ''} />
        <Stat label="Input tokens" value={totals.inputTokens.toLocaleString('en-IN')} icon={Sparkles} tone="ai" hint={`${cacheShare}% served from prompt cache`} />
        <Stat label="Output tokens" value={totals.outputTokens.toLocaleString('en-IN')} icon={Sparkles} tone="ai" />
        <Stat label="Avg latency" value={`${Math.round(totals.avgLatencyMs)} ms`} icon={Timer} />
        <Stat label="Estimated spend" value={`$${estimatedCostUsd.toFixed(4)}`} icon={Coins} hint="at list price" />
      </div>

      <div className="two-col even">
        <Card title="By purpose" icon={Gauge}>
          <div className="table-scroll">
            <table className="plain">
              <thead><tr><th>Purpose</th><th>Calls</th><th>Input tok</th><th>Output tok</th><th>Avg in / call</th></tr></thead>
              <tbody>
                {byPurpose.length === 0 && <tr><td colSpan="5" className="muted">No AI calls yet.</td></tr>}
                {byPurpose.map((p) => (
                  <tr key={p.purpose}><td>{p.purpose === 'classify' ? 'Classify + prioritise' : 'Draft reply'}</td><td>{p.calls}</td><td>{p.inputTokens.toLocaleString('en-IN')}</td><td>{p.outputTokens.toLocaleString('en-IN')}</td><td>{p.calls ? Math.round(p.inputTokens / p.calls) : 0}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Recent failures" icon={ShieldAlert}>
          {recentErrors.length === 0 ? <p className="muted row"><CheckCircle2 size={16} className="pos" />No failures recorded.</p> : (
            <ul className="plain-list">
              {recentErrors.map((e, i) => <li key={i}><span className="muted small">{formatDate(e.createdAt, { time: true })}</span> · {e.purpose}<br /><code>{e.error}</code></li>)}
            </ul>
          )}
        </Card>
      </div>

      <Card title="How the AI is used (and kept cheap)" icon={TriangleAlert}>
        <ul className="tips">
          <li><strong>One call classifies and prioritises</strong> a new ticket - it only sees the ticket text and a one-line book summary, never the knowledge base or history.</li>
          <li><strong>Drafts are generated only on request</strong> - when an admin clicks “Generate AI Response”. Opening a ticket never calls the model. A saved draft is shown as it was, flagged if the conversation has changed since, and concurrent requests for one ticket share a single call.</li>
          <li><strong>Only the relevant policy sections</strong> for the ticket's category are sent, plus facts about the one book in question and the last few messages.</li>
          <li><strong>Dates and amounts are computed in code</strong> (royalty cycle, payout deadline, thresholds) and handed to the model as facts, so it never does date maths.</li>
          <li><strong>Graceful degradation:</strong> if the provider is down or rate-limited, tickets are still created, triaged by keyword rules (tagged "Rules"), and drafts fall back to policy templates.</li>
        </ul>
      </Card>
    </div>
  );
}
