// Repeatable AI evaluation on the seven sample queries from the assignment brief.
//
//   npm run eval:ai                   LIVE: real OpenAI calls (needs OPENAI_API_KEY; roughly 15 calls, well under 1 US cent)
//   npm run eval:ai -- --offline      no API calls: evaluates the rule-based triage + template-draft fallback instead
//   npm run eval:ai -- --show-replies print every generated reply
//
// Live evaluation is NEVER part of `npm test` (which needs no key and costs nothing).
import { config } from '../src/config/index.js';
import { runEval } from './run.js';

const args = new Set(process.argv.slice(2));
const offline = args.has('--offline');
if (!offline && !(config.ai.enabled && config.ai.apiKey)) {
  console.error('Live evaluation needs OPENAI_API_KEY (and AI_ENABLED not false). Use --offline to evaluate the fallback path without any API call.');
  process.exit(2);
}

console.log(offline ? 'AI evaluation - OFFLINE (rule-based triage + template drafts, no API calls)' : `AI evaluation - LIVE (${config.ai.model}); real API calls are made`);
const { results, usage, passed, total } = await runEval({
  aiProvider: offline ? null : undefined,
  log: (r) => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(22)} ${String(r.category).padEnd(34)} ${String(r.priority).padEnd(8)} ${r.categorySource}/${r.draftSource}${r.draftCalls > 1 ? ' (regenerated)' : ''}`),
});

for (const r of results.filter((x) => !x.pass)) {
  console.log(`\n  ${r.id}:`);
  if (!r.checks.category) console.log(`    category: expected "${r.expectedCategory}", got "${r.category}"`);
  if (!r.checks.priority) console.log(`    priority "${r.priority}" is outside the plausible set`);
  for (const p of r.qualityProblems) console.log(`    quality: ${p}`);
  for (const c of r.contentFailures) console.log(`    content: ${c}`);
}
if (args.has('--show-replies')) for (const r of results) console.log(`\n----- ${r.id} (${r.draftSource}) -----\n${r.reply}`);

console.log(`\n${passed}/${total} samples passed`);
if (!offline) {
  const aiUsed = results.filter((r) => r.aiUsed).length;
  const cost = (usage.inputTokens * config.ai.pricing.inputPerMTok + usage.outputTokens * config.ai.pricing.outputPerMTok + usage.cacheReadTokens * config.ai.pricing.cacheReadPerMTok) / 1e6;
  console.log(`AI used for both triage and draft: ${aiUsed}/${total} | LLM calls: ${usage.calls} (${usage.failed} failed) | tokens in/out/cached: ${usage.inputTokens}/${usage.outputTokens}/${usage.cacheReadTokens} | est. cost $${cost.toFixed(4)}`);
}
process.exit(passed === total || offline ? 0 : 1);
