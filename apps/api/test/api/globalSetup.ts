import pg from 'pg';
import { migrate } from '../../src/migrate.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://splitsmart:splitsmart_dev@localhost:5432/splitsmart_test';

/**
 * Runs once before all tests: wipes the test database and applies every migration
 * from scratch. This doubles as proof that migrations work on a clean database.
 */
export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Cannot reach the test database at ${TEST_DATABASE_URL.replace(/:[^:@/]+@/, ':***@')}.\n` +
        'Start it with: docker compose -f deploy/docker-compose.yml up -d',
      { cause: err },
    );
  }
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();

  await migrate(TEST_DATABASE_URL, 'up');
}
