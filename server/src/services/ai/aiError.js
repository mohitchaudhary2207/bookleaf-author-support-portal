/** Typed failure reasons the AI service maps to graceful-degradation behaviour and admin messaging. */
export class AIError extends Error {
  constructor(reason, message, { retryable = false, cause } = {}) {
    super(message);
    this.name = 'AIError';
    // 'rate_limited' | 'quota' | 'unavailable' | 'timeout' | 'auth' | 'refused' | 'invalid_response' | 'disabled'
    this.reason = reason;
    this.retryable = retryable;
    this.cause = cause;
  }
}
