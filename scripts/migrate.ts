/**
 * Migration runner.
 *
 * Applies every `.sql` file in `./drizzle` in filename order, exactly once.
 * Applied migrations are tracked in `__shift_migrations`, so re-running is a
 * no-op. This deliberately does not depend on drizzle-kit's journal format —
 * the SQL files in this repo are hand-audited and idempotent.
 *
 * Usage:
 *   npm run db:migrate
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { neon } from '@neondatabase/serverless';

import { requireConnectionString } from './_env';

const MIGRATIONS_DIR = resolve(process.cwd(), 'drizzle');
const TRACKING_TABLE = '__shift_migrations';

async function main(): Promise<void> {
  const url = requireConnectionString();
  const sql = neon(url);

  console.log('\n  ▸ Shift — applying database migrations');
  console.log(`    target: ${url.replace(/:\/\/[^@]*@/, '://***@')}\n`);

  await sql(
    `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`,
  );

  const appliedRows = (await sql(`SELECT name FROM ${TRACKING_TABLE}`)) as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((row) => row.name));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('  ✖ No .sql files found in ./drizzle\n');
    process.exit(1);
  }

  let appliedCount = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`    · ${file} — already applied`);
      continue;
    }

    const contents = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');

    // The Neon HTTP driver executes one statement per call, so the file is
    // split on semicolons at statement boundaries. `$$`-quoted bodies and
    // single-quoted strings are preserved.
    const statements = splitStatements(contents);

    process.stdout.write(`    ▸ ${file} … `);
    for (const statement of statements) {
      await sql(statement);
    }
    await sql(`INSERT INTO ${TRACKING_TABLE} (name) VALUES ($1)`, [file]);
    appliedCount += 1;
    console.log('applied');
  }

  console.log(
    appliedCount === 0
      ? '\n  ✔ Database is already up to date.\n'
      : `\n  ✔ Applied ${appliedCount} migration file(s).\n`,
  );
}

/**
 * Splits a SQL script into individual statements.
 *
 * Handles: line comments, block comments, single-quoted strings (with `''`
 * escaping), double-quoted identifiers, and PostgreSQL dollar-quoted blocks
 * (`$$ … $$`, `$tag$ … $tag$`).
 */
function splitStatements(script: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;

  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dollarTag: string | null = null;

  while (index < script.length) {
    const char = script[index];
    const next = script[index + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      current += char;
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (dollarTag) {
      if (script.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += char;
      index += 1;
      continue;
    }

    if (inSingleQuote) {
      if (char === "'" && next === "'") {
        current += "''";
        index += 2;
        continue;
      }
      if (char === "'") inSingleQuote = false;
      current += char;
      index += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') inDoubleQuote = false;
      current += char;
      index += 1;
      continue;
    }

    // Not inside anything: detect the start of a new context.
    if (char === '-' && next === '-') {
      inLineComment = true;
      index += 2;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 2;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      current += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      index += 1;
      continue;
    }
    if (char === '$') {
      const match = /^\$[A-Za-z_0-9]*\$/.exec(script.slice(index));
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length;
        continue;
      }
    }
    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);

  return statements;
}

main().catch((error) => {
  console.error('\n  ✖ Migration failed:\n', error);
  process.exit(1);
});
