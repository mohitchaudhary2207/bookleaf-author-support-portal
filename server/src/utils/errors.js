/**
 * Application error carrying an HTTP status and a stable machine-readable code.
 * The error-handling middleware renders these as { error: { code, message, details } }.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this resource') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message, details) => new AppError(409, 'CONFLICT', message, details);
export const validationError = (details) => new AppError(422, 'VALIDATION_ERROR', 'Request validation failed', details);
export const tooMany = (message = 'Too many requests, please slow down') => new AppError(429, 'RATE_LIMITED', message);
