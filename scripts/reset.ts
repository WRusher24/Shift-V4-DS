/**
 * Destructive reset.
 *
 * Deletes every row from the Shift schema, then optionally reseeds. This is a
 * development and staging tool — it refuses to run against a database whose
 * host looks like a production Neon branch unless `--yes-really` is passed.
 *
 * Usage:
 *   npm run db:reset                 # wipe only
 *   npm run db:reset -- --seed       # wipe, then seed
 *   npm run db:reset -- --yes-really # skip the production guard
 */

import { loadEnv } from './_env';

const PRODUCTION_HOST_HINTS = ['prod', 'production', 'main'];

async function main(): Promise<void> {
  loadEnv();

  const shouldSeed = process.argv.includes('--seed');
  const skipGuard = process.argv.includes('--yes-really');

  const url = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error('\n  ✖ DATABASE_URL is not set.\n');
    process.exit(1);
  }

  const host = url.replace(/^.*@/, '').split('/')[0] ?? '';
  const looksLikeProduction = PRODUCTION_HOST_HINTS.some((hint) => host.toLowerCase().includes(hint));

  if (looksLikeProduction && !skipGuard) {
    console.error(
      `\n  ✖ Refusing to reset "${host}" because the host name looks like a production branch.\n` +
        '    Re-run with `-- --yes-really` if you are certain.\n',
    );
    process.exit(1);
  }

  const { getRepository } = await import('../lib/repo/index');
  const repository = getRepository();

  console.log(`\n  ▸ Shift — resetting ${repository.describe()}`);
  console.log('    deleting: point_awards, pallet_logs, pause_logs, batch_members,');
  console.log('              batches, pallet_sizes, races, products, workers, app_settings\n');

  await repository.truncateAll();
  console.log('    ✔ All operational data removed.');

  if (shouldSeed) {
    const { seedDatabase } = await import('../lib/services/seed');
    const result = await seedDatabase({ reset: false });
    console.log(
      `    ✔ Reseeded: ${result.workers} workers, ${result.products} products, ` +
        `${result.batches} batches, ${result.palletLogs} pallets.\n`,
    );
  } else {
    console.log('\n  ▸ Next: npm run db:seed\n');
  }
}

main().catch((error) => {
  console.error('\n  ✖ Reset failed:\n', error);
  process.exit(1);
});
