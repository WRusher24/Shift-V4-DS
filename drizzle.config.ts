import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * `npm run db:generate` -> writes SQL migrations into ./drizzle
 * `npm run db:migrate`  -> applies them through scripts/migrate.ts
 * `npm run db:push`     -> pushes the schema straight to the database (dev only)
 */
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
