import OpenAI from 'openai';
import { AIError } from './aiError.js';

/** Translate SDK errors into AIError so nothing above this file depends on SDK internals. */
function translate(err) {
  if (err instanceof AIError) return err;
  if (err instanceof OpenAI.APIConnectionTimeoutError) return new AIError('timeout', 'AI provider timed out', { retryable: true, cause: err });
  if (err instanceof OpenAI.APIConnectionError) return new AIError('unavailable', 'Could not reach the AI provider', { retryable: true, cause: err });
  if (err instanceof OpenAI.RateLimitError) {
    // OpenAI uses 429 both for rate limits (retry soon) and for an exhausted billing quota (needs a human).
    if (err.code === 'insufficient_quota') return new AIError('quota', 'The AI account has no remaining quota', { cause: err });
    return new AIError('rate_limited', 'AI provider rate limit reached', { retryable: true, cause: err });
  }
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) return new AIError('auth', 'AI provider rejected the API key', { cause: err });
  if (err instanceof OpenAI.APIError && err.status >= 500) return new AIError('unavailable', `AI provider error (${err.status})`, { retryable: true, cause: err });
  if (err instanceof OpenAI.APIError) return new AIError('invalid_response', `AI request rejected (${err.status})`, { cause: err });
  return new AIError('unavailable', err?.message || 'Unknown AI error', { cause: err });
}

/**
 * Thin adapter over the OpenAI SDK. The rest of the app only knows this one method:
 *
 *   callTool({ system, user, tool, maxTokens }) -> { input, usage, model }
 *
 * `tool` is a provider-neutral { name, description, input_schema } (JSON Schema). We always force a
 * function call so the model returns structured JSON (category/priority, or reply + notes) instead
 * of free text we would have to parse; `strict` makes the API enforce the schema.
 *
 * The API key is read here, on the server, from the environment - it never reaches the browser.
 * Prompt caching on OpenAI is automatic for repeated prefixes (>1024 tokens), which is why the static
 * rules/knowledge base live in the system message and the per-ticket text in the user message.
 */
export function createOpenAIProvider({ apiKey, model, timeoutMs, maxRetries, baseURL }) {
  // baseURL is only overridden in tests (a local mock of the Chat Completions API).
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries, ...(baseURL ? { baseURL } : {}) });

  return {
    name: 'openai',
    model,
    async callTool({ system, user, tool, maxTokens }) {
      let response;
      try {
        response = await client.chat.completions.create({
          model,
          max_completion_tokens: maxTokens,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema, strict: true } }],
          tool_choice: { type: 'function', function: { name: tool.name } },
          parallel_tool_calls: false,
        });
      } catch (err) {
        throw translate(err);
      }

      const choice = response.choices?.[0];
      if (choice?.message?.refusal) throw new AIError('refused', 'The AI declined to process this request');
      const call = choice?.message?.tool_calls?.find((c) => c.type === 'function' && c.function?.name === tool.name);
      if (!call) throw new AIError('invalid_response', 'AI response did not contain the expected structured output');

      let input;
      try {
        input = JSON.parse(call.function.arguments);
      } catch {
        // Typically finish_reason === 'length': the output was cut off mid-JSON.
        throw new AIError('invalid_response', 'AI returned malformed structured output');
      }

      const cached = response.usage?.prompt_tokens_details?.cached_tokens ?? 0;
      return {
        input,
        model: response.model ?? model,
        usage: {
          // OpenAI's prompt_tokens includes cached tokens; report them separately so cost is accurate.
          inputTokens: Math.max((response.usage?.prompt_tokens ?? 0) - cached, 0),
          outputTokens: response.usage?.completion_tokens ?? 0,
          cacheReadTokens: cached,
        },
      };
    },
  };
}
