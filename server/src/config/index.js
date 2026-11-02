import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function resolveFromRoot(p, fallback) {
  const target = p || fallback;
  return path.isAbsolute(target) ? target : path.resolve(serverRoot, target);
}

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret || jwtSecret === 'change-me') {
  if (isProd) {
    // Fail fast: running production with a guessable signing key would be a vulnerability.
    throw new Error('JWT_SECRET must be set to a strong random value in production');
  }
  // In development, generate an ephemeral secret (sessions reset on restart).
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET not set - using an ephemeral development secret');
}

export const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT) || 4000,
  serverRoot,
  clientDist: path.resolve(serverRoot, '../client/dist'),
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  databasePath: env.DATABASE_PATH === ':memory:' ? ':memory:' : resolveFromRoot(env.DATABASE_PATH, './storage/bookleaf.db'),
  uploadDir: resolveFromRoot(env.UPLOAD_DIR, './storage/uploads'),
  seedDataPath: path.resolve(serverRoot, 'data/bookleaf_sample_data.json'),
  seed: {
    authorPassword: env.SEED_AUTHOR_PASSWORD || 'Author@123',
    adminPassword: env.SEED_ADMIN_PASSWORD || 'Admin@123',
  },
  auth: {
    jwtSecret,
    tokenTtl: '12h',
    cookieName: 'bl_session',
    cookieMaxAgeMs: 12 * 60 * 60 * 1000,
  },
  uploads: {
    maxFiles: 3,
    maxFileBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain'],
  },
  ai: {
    enabled: bool(env.AI_ENABLED, true),
    apiKey: env.OPENAI_API_KEY || '',
    model: env.AI_MODEL || 'gpt-4o-mini',
    timeoutMs: 20_000,
    maxRetries: 2,
    // Circuit breaker: after N consecutive failures, skip AI calls for a cool-down window
    breakerThreshold: 4,
    breakerCooldownMs: 60_000,
    // Cost controls
    maxTicketChars: 2000,
    maxThreadMessages: 6,
    maxMessageChars: 800,
    // List prices (USD per million tokens) for the cost estimate on the admin AI page. Override if pricing changes.
    pricing: { inputPerMTok: Number(env.AI_PRICE_INPUT) || 0.15, outputPerMTok: Number(env.AI_PRICE_OUTPUT) || 0.6, cacheReadPerMTok: Number(env.AI_PRICE_CACHE_READ) || 0.075 },
    classifyMaxTokens: 250,
    draftMaxTokens: 900,
  },
  // First-response targets (hours) by priority - drives the "overdue" highlighting in the queue.
  sla: { Critical: 4, High: 24, Medium: 48, Low: 72 },
};
