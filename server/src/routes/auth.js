import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { cookieOptions, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authSchemas } from '../schemas/index.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError, unauthorized } from '../utils/errors.js';

// Used when the email is unknown so the response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function authRoutes({ repos, requireAuth }) {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.isTest,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Please wait a few minutes and try again.')),
  });

  router.post('/login', loginLimiter, validate(authSchemas.login), asyncHandler(async (req, res) => {
    const { email, password } = req.valid.body;
    const row = repos.users.findByEmailWithHash(email);
    const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) throw unauthorized('Invalid email or password');

    const user = repos.users.toUser(row);
    const token = signToken(user);
    res.cookie(config.auth.cookieName, token, cookieOptions());
    res.json({ user, token });
  }));

  router.post('/logout', (_req, res) => {
    res.clearCookie(config.auth.cookieName, { ...cookieOptions(), maxAge: undefined });
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

  return router;
}
