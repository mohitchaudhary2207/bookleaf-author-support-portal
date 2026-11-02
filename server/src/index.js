import { createApp } from './app.js';
import { config } from './config/index.js';
import { createContainer } from './container.js';
import { createDatabase } from './db/index.js';
import { seedDatabase } from './db/seed.js';
import { logger } from './utils/logger.js';

const db = createDatabase();
// First boot (or a fresh ephemeral disk on a free host): load the provided dataset so the app works out of the box.
seedDatabase(db);

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
