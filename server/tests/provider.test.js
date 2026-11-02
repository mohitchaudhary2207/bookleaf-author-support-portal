import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import './helpers.js'; // sets test env first
import { createOpenAIProvider } from '../src/services/ai/openaiProvider.js';
import { CLASSIFY_TOOL } from '../src/services/ai/prompts.js';

/** Local stand-in for POST /v1/chat/completions so the real SDK code path runs without network or API key. */
describe('OpenAI provider adapter (against a local mock of the Chat Completions API)', () => {
  let server; let baseURL; let handler; const requests = [];

  before(async () => {
    server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        requests.push({ url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
        handler(req, res);
      });
    });
    await new Promise((r) => server.listen(0, r));
    baseURL = `http://127.0.0.1:${server.address().port}/v1`;
  });
  after(() => server.close());

  const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const provider = () => createOpenAIProvider({ apiKey: 'sk-test', model: 'gpt-4o-mini', timeoutMs: 2000, maxRetries: 0, baseURL });
  const call = () => provider().callTool({ system: 'SYSTEM TEXT', user: 'USER TEXT', tool: CLASSIFY_TOOL, maxTokens: 250 });
  const completion = (message, extra = {}) => ({
    id: 'chatcmpl-1', object: 'chat.completion', model: 'gpt-4o-mini-2024-07-18',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: null, ...message } }],
    usage: { prompt_tokens: 521, completion_tokens: 45, prompt_tokens_details: { cached_tokens: 200 } }, ...extra,
  });
  const toolCall = (args) => ({ tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'classify_ticket', arguments: typeof args === 'string' ? args : JSON.stringify(args) } }] });

  it('sends the expected request shape and parses the forced function call', async () => {
    handler = (_req, res) => json(res, 200, completion(toolCall({ category: 'Royalty & Payments', priority: 'High', confidence: 0.9, rationale: 'x' })));
    const out = await call();
    assert.equal(out.input.category, 'Royalty & Payments');
    assert.deepEqual(out.usage, { inputTokens: 321, outputTokens: 45, cacheReadTokens: 200 }, 'cached tokens are split out of the prompt total');

    const { url, headers, body } = requests.at(-1);
    assert.equal(url, '/v1/chat/completions');
    assert.equal(headers.authorization, 'Bearer sk-test', 'the key is sent only from this server to the provider');
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.max_completion_tokens, 250);
    assert.deepEqual(body.tool_choice, { type: 'function', function: { name: 'classify_ticket' } });
    assert.equal(body.tools[0].function.strict, true);
    assert.equal(body.tools[0].function.parameters.properties.category.enum.length, 6);
    assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
    assert.equal(body.messages[0].content, 'SYSTEM TEXT');
  });

  it('maps provider failures to typed AIErrors', async () => {
    const cases = [[429, 'rate_limited', 'rate_limit_exceeded'], [429, 'quota', 'insufficient_quota'], [500, 'unavailable'], [503, 'unavailable'], [401, 'auth'], [400, 'invalid_response']];
    for (const [status, reason, code] of cases) {
      handler = (_req, res) => json(res, status, { error: { message: `boom ${status}`, type: 'x', code: code ?? null } });
      await assert.rejects(call, (err) => { assert.equal(err.reason, reason, `HTTP ${status} ${code ?? ''}`); return true; });
    }
  });

  it('maps a refusal, a missing function call and truncated JSON', async () => {
    handler = (_req, res) => json(res, 200, completion({ refusal: 'I cannot help with that' }));
    await assert.rejects(call, (e) => e.reason === 'refused');
    handler = (_req, res) => json(res, 200, completion({ content: 'free text instead of a function call' }));
    await assert.rejects(call, (e) => e.reason === 'invalid_response');
    handler = (_req, res) => json(res, 200, completion(toolCall('{"category":"Royalty')));
    await assert.rejects(call, (e) => e.reason === 'invalid_response');
  });

  it('maps connection failures to "unavailable"', async () => {
    const dead = createOpenAIProvider({ apiKey: 'k', model: 'm', timeoutMs: 500, maxRetries: 0, baseURL: 'http://127.0.0.1:1/v1' });
    await assert.rejects(() => dead.callTool({ system: 's', user: 'u', tool: CLASSIFY_TOOL, maxTokens: 10 }), (e) => ['unavailable', 'timeout'].includes(e.reason));
  });
});
