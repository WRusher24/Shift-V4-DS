/**
 * Minimal .env loader for the CLI scripts.
 *
 * Kept dependency-free on purpose: the scripts must run with nothing but
 * `tsx`, before `npm install` has necessarily completed on a fresh clone.
 * `process.env` always wins, so `DATABASE_URL=... npm run db:seed` overrides
 * the file without editing anything.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    // Strip matching surrounding quotes.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}

/** Loads `.env.local` then `.env`, without clobbering existing variables. */
export function loadEnv(): void {
  for (const filename of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;

    const parsed = parseEnvFile(readFileSync(path, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined && value !== '') {
        process.env[key] = value;
      }
    }
  }
}

/** Resolves the direct (non-pooled) connection string for CLI tooling. */
export function requireConnectionString(): string {
  loadEnv();

  const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error(
      '\n  ✖ DATABASE_URL is not set.\n\n' +
        '  Create a Neon project, copy the connection string into .env.local, then re-run.\n' +
        '  See DEPLOYS_GUIDE.md for the full walkthrough.\n',
    );
    process.exit(1);
  }
  return url;
}
