import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl.split('?')[0]}`));
}

/** Single place that turns any thrown error into the documented { error: {...} } envelope. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) };
  } else if (err instanceof ZodError) {
    status = 422;
    body = { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  } else if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    status = tooBig ? 413 : 422;
    body = { code: tooBig ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR', message: tooBig ? 'Each attachment must be 5 MB or smaller' : `Upload problem: ${err.message}` };
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'INVALID_JSON', message: 'Request body is not valid JSON' };
  } else if (err.type === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' };
  }

  if (status >= 500) logger.error(`[${req.id}] ${req.method} ${req.originalUrl}`, err);
  res.status(status).json({ error: { ...body, requestId: req.id } });
}
