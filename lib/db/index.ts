import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';

import * as schema from '@/lib/db/schema';

/**
 * Neon (serverless PostgreSQL) connection factory.
 *
 * The client is cached on `globalThis` so that Next.js hot reloads and Lambda
 * container re-use do not open a new connection pool per request. The Neon HTTP
 * driver is used because it is stateless: it issues a fetch per query and needs
 * no TCP socket, which is exactly what Vercel's Edge/Node runtimes want.
 */

type ShiftDatabase = NeonHttpDatabase<typeof schema>;

interface DbGlobal {
  __shiftDb?: ShiftDatabase;
}

const globals = globalThis as unknown as DbGlobal;

/** True when a database connection string has been configured. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Resolves the connection string. `DATABASE_URL_UNPOOLED` (the direct,
 * non-pooled Neon endpoint) takes precedence for CLI tooling such as
 * migrations and seeding, where a long-lived connection is preferable.
 */
export function resolveConnectionString(options?: { preferUnpooled?: boolean }): string | null {
  const pooled = process.env.DATABASE_URL?.trim();
  const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
  if (options?.preferUnpooled && unpooled) return unpooled;
  return pooled || unpooled || null;
}

export function getDb(options?: { preferUnpooled?: boolean }): ShiftDatabase {
  const url = resolveConnectionString(options);
  if (!url) {
    throw new Error(
      'DATABASE_URL is not configured. Set it in .env.local, or leave it empty to run the built-in local file store.',
    );
  }

  if (globals.__shiftDb) return globals.__shiftDb;

  const sql = neon(url);
  const db = drizzle(sql, { schema });
  globals.__shiftDb = db;
  return db;
}

export { schema };
