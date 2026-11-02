import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export const signToken = (user) => jwt.sign({ sub: user.id, role: user.role }, config.auth.jwtSecret, { expiresIn: config.auth.tokenTtl });

export const cookieOptions = () => ({
  httpOnly: true,                          // not readable from JS -> XSS cannot steal the session
  sameSite: 'lax',                         // blocks cross-site POSTs carrying the cookie
  secure: config.isProd,
  maxAge: config.auth.cookieMaxAgeMs,
  path: '/',
});

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return { token: header.slice(7).trim(), via: 'bearer' };
  const cookie = req.cookies?.[config.auth.cookieName];
  return cookie ? { token: cookie, via: 'cookie' } : { token: null };
}

/**
 * Authentication middleware. Accepts either an Authorization: Bearer token (API clients, Postman)
 * or the httpOnly session cookie (the web app). The user is re-read from the database on every
 * request so role changes/deletions take effect immediately.
 */
export function authenticate({ users }) {
  return (req, _res, next) => {
    const { token, via } = extractToken(req);
    if (!token) return next(unauthorized());
    try {
      const payload = jwt.verify(token, config.auth.jwtSecret);
      const user = users.findById(payload.sub);
      if (!user) return next(unauthorized('Account no longer exists'));
      req.user = user;
      req.authVia = via;
      next();
    } catch {
      next(unauthorized('Session expired or invalid - please sign in again'));
    }
  };
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(forbidden(`This endpoint is for ${roles.join('/')} accounts only`));

/**
 * CSRF defence for cookie-authenticated, state-changing requests: the Origin header (sent by all
 * modern browsers on cross-origin and same-origin POSTs) must match this host or an allow-listed
 * origin. Bearer-token requests are not ambient credentials, so they are exempt.
 */
export function originCheck(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.authVia !== 'cookie') return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  const sameHost = (() => { try { return new URL(origin).host === req.headers.host; } catch { return false; } })();
  if (sameHost || config.corsOrigins.includes(origin)) return next();
  return next(forbidden('Cross-site request blocked'));
}
