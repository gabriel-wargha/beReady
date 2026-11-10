import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as schema from './schema';

/** The database type the rest of the code uses. It is the same for both drivers below. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export interface DbOptions {
  /** A Postgres connection string, for example from Neon. When set, it wins. */
  url?: string;
  /** Folder for the embedded database. Leave out for a throwaway in-memory one (tests). */
  pgliteDir?: string;
}

/**
 * Opens the database and applies any migrations that have not run yet.
 *
 * - With DATABASE_URL: connects to a real Postgres server (Neon in production).
 * - Without it: runs PGlite, a real Postgres engine embedded in this process,
 *   so the app and the tests work with nothing installed.
 *
 * Both speak the same SQL and use the same schema and migrations.
 */
export async function createDb(
  options: DbOptions = {},
): Promise<{ db: Db; close: () => Promise<void> }> {
  if (options.url) {
    const pool = new pg.Pool({ connectionString: options.url });
    const db = drizzleNodePg(pool, { schema });
    await migrateNodePg(db, { migrationsFolder });
    return { db, close: () => pool.end() };
  }
  const client = new PGlite(options.pgliteDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db, close: () => client.close() };
}
