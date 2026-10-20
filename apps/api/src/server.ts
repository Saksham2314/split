import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

const config = loadConfig();
const db = createPool(config.databaseUrl);
const app = createApp(config, db);

const server = app.listen(config.port, () => {
  console.log(`SplitSmart API listening on port ${config.port} (${config.env})`);
});

// Docker sends SIGTERM on `docker stop` / redeploy. Finish in-flight requests,
// close DB connections, then exit, instead of cutting users off mid-request.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
