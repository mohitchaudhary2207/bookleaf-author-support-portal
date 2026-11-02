import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { config } from './config/index.js';
import { CATEGORIES, PRIORITIES, PRODUCTION_STAGES, STATUSES } from './config/constants.js';
import { authenticate, originCheck, requireRole } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { bookRoutes } from './routes/books.js';
import { eventRoutes } from './routes/events.js';
import { ticketRoutes } from './routes/tickets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(container) {
  const { repos, tickets, ai, events } = container;
  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1); // correct client IPs / secure cookies behind Render, Railway, etc.

  app.use(requestContext);

  // ---- API docs (Swagger UI) - mounted before the strict CSP because Swagger UI needs inline assets
  const openapi = YAML.parse(fs.readFileSync(path.join(__dirname, 'docs/openapi.yaml'), 'utf8'));
  app.get('/api/openapi.json', (_req, res) => res.json(openapi));
  app.use('/api/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'BookLeaf Support API' }));

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null, // do not force https: breaks plain-http VPS / localhost deployments
      },
    },
  }));
  if (config.corsOrigins.length) app.use('/api', cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // ---- API v1 -----------------------------------------------------------------------------
  const api = express.Router();
  const requireAuth = authenticate({ users: repos.users });
  const adminOnly = requireRole('admin');

  api.get('/health', (_req, res) => res.json({ status: 'ok', ai: ai.status(), time: new Date().toISOString() }));
  api.use('/auth', authRoutes({ repos, requireAuth }));

  // Everything below requires a valid session (and passes the CSRF origin check).
  api.use(requireAuth, originCheck);
  api.get('/meta', (_req, res) => res.json({ categories: CATEGORIES, priorities: PRIORITIES, statuses: STATUSES, productionStages: PRODUCTION_STAGES, sla: config.sla }));
  api.use('/books', bookRoutes({ repos }));
  api.use('/tickets', ticketRoutes({ tickets }));
  api.use('/events', eventRoutes({ events }));
  api.use('/admin', adminOnly, adminRoutes({ tickets, repos, ai }));

  app.use('/api/v1', api);
  app.use('/api', notFoundHandler); // unknown API routes -> JSON 404, never the SPA

  // ---- Frontend (production build) -------------------------------------------------------------
  if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
