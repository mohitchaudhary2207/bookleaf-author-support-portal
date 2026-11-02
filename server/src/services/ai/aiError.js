/** Typed failure reasons the AI service maps to graceful-degradation behaviour and admin messaging. */
export class AIError extends Error {
  constructor(reason, message, { retryable = false, cause, paused = false } = {}) {
    super(message);
    this.name = 'AIError';
    // 'rate_limited' | 'quota' | 'unavailable' | 'timeout' | 'auth' | 'refused' | 'invalid_response' | 'quality_check' | 'disabled'
    this.reason = reason;
    this.retryable = retryable;
    this.cause = cause;
    // true when the call was not even attempted because the circuit breaker is open; `reason` is then the
    // category of the failure that opened it, so the admin sees the real cause (auth / quota / ...).
    this.paused = paused;
  }
}
