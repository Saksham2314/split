import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

// migrations/ sits next to src/ and dist/, so this resolves the same in dev and in the built image.
export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Applies (or reverts) SQL migrations. node-pg-migrate records applied files in the
 * `pgmigrations` table and holds a Postgres advisory lock while running, so two
 * deploys starting at once can't apply the same migration twice.
 */
export async function migrate(databaseUrl: string, direction: 'up' | 'down' = 'up') {
  // Default count: "up" applies every pending migration, "down" reverts only the latest one.
  return runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction,
    migrationsTable: 'pgmigrations',
    checkOrder: true,
    log: () => {},
  });
}

// CLI: `node dist/migrate.js up` (production) or `npm run migrate -- down` (dev)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  migrate(databaseUrl, direction)
    .then((ran) => {
      console.log(ran.length ? `Migrated ${direction}: ${ran.map((m) => m.name).join(', ')}` : 'No migrations to run');
    })
    .catch((err: unknown) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
