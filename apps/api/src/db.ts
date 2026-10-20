import pg from 'pg';

// Postgres BIGINT (type OID 20) arrives as a string by default because it can exceed
// JavaScript's safe integer range (2^53). Our IDs and paise amounts stay far below that
// (amounts are capped by validation), so converting to number is safe and much simpler.
pg.types.setTypeParser(20, (value) => Number(value));

export type Db = pg.Pool;
export type DbClient = pg.PoolClient;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

/**
 * Runs `fn` inside a single database transaction: either every statement commits,
 * or (on any thrown error) everything is rolled back. Used when one API call writes
 * several rows that must stay consistent, e.g. an expense and its shares.
 */
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
