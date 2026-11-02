import crypto from 'node:crypto';

/** Tag every request with an id (echoed in X-Request-Id and in error bodies) for log correlation. */
export function requestContext(req, res, next) {
  req.id = req.headers['x-request-id']?.toString().slice(0, 64) || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
