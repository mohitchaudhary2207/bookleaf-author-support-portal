import { createApp } from './app.js';
import { config } from './config/index.js';
import { createContainer } from './container.js';
import { createDatabase } from './db/index.js';
import { seedDatabase } from './db/seed.js';
import { resolveSeedPolicy } from './db/seedPolicy.js';
import { logger } from './utils/logger.js';

const db = createDatabase();
// Demo data is seeded only when the policy allows it: on by default in development, OFF by default in
// production (needs SEED_DEMO_DATA=true plus explicit passwords). resolveSeedPolicy throws on misconfiguration.
const seedPolicy = resolveSeedPolicy();
if (seedPolicy.enabled) {
  seedDatabase(db, { authorPassword: seedPolicy.authorPassword, adminPassword: seedPolicy.adminPassword });
} else {
  logger.info(seedPolicy.reason);
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) logger.warn('The database has no user accounts, so nobody can sign in. Import real data or enable the demo seed.');
}

const container = createContainer({ db });
const app = createApp(container);

const server = app.listen(config.port, () => {
  logger.info(`BookLeaf Support Portal listening on http://localhost:${config.port}  (env: ${config.env})`);
  logger.info(`API docs: http://localhost:${config.port}/api/docs`);
});

// Graceful shutdown: stop accepting connections, close SSE streams, flush SQLite.
function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  container.close();
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
