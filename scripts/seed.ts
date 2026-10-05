/**
 * Database seeding.
 *
 * Populates the configured database with the demo dataset: crew, detergent
 * products with pallet configurations, an open race, two weeks of batch history
 * and one batch currently running.
 *
 * Usage:
 *   npm run db:seed            # seed only if the database is empty
 *   npm run db:seed -- --force # wipe operational data, then reseed
 *
 * WARNING: `--force` deletes every worker, product, batch, pallet and point
 * award. It never touches anything outside this schema.
 */

import { loadEnv } from './_env';

async function main(): Promise<void> {
  loadEnv();

  const force = process.argv.includes('--force') || process.argv.includes('-f');

  if (!process.env.DATABASE_URL?.trim() && !process.env.DATABASE_URL_UNPOOLED?.trim()) {
    console.error(
      '\n  ✖ DATABASE_URL is not set.\n\n' +
        '  The application seeds itself automatically when running on the local store,\n' +
        '  so `npm run db:seed` is only needed for PostgreSQL. Set DATABASE_URL in\n' +
        '  .env.local, or run `npm run dev` to use the local store instead.\n',
    );
    process.exit(1);
  }

  if (force) {
    console.warn('\n  ⚠  --force: all existing operational data will be deleted.\n');
  }

  // Imported after loadEnv so the repository factory sees DATABASE_URL.
  const { getRepository } = await import('../lib/repo/index');
  const { seedDatabase, verifySeedLedger } = await import('../lib/services/seed');

  const repository = getRepository();
  console.log(`\n  ▸ Shift — seeding ${repository.describe()}\n`);

  if (!force) {
    const existing = await repository.listWorkers();
    if (existing.length > 0) {
      console.log(`    · Database already contains ${existing.length} worker(s). Nothing to do.`);
      console.log('    · Re-run with `-- --force` to wipe and reseed.\n');
      return;
    }
  }

  const started = Date.now();
  const result = await seedDatabase({ reset: force });

  // Verify the fan-out ledger: attribution correctness plus per-race value.
  const batches = await repository.listBatches({ limit: 100000 });
  const batchIds = batches.map((batch) => batch.id);
  const [pallets, awards, races, raceProductPoints, products] = await Promise.all([
    repository.listPalletLogsForBatches(batchIds),
    repository.listPointAwardsForBatches(batchIds),
    repository.listRaces(),
    repository.listRaceProductPoints(),
    repository.listProducts(),
  ]);
  const verification = verifySeedLedger({ pallets, awards, races, raceProductPoints, products });

  console.log('    ✔ Seed complete in %d ms', Date.now() - started);
  console.log('');
  console.log(`      workers ................ ${result.workers}`);
  console.log(`      production lines ....... ${result.lines}`);
  console.log(`      products ............... ${result.products}`);
  console.log(`      pallet sizes ........... ${result.palletSizes}`);
  console.log(
    `      races .................. ${result.races} (${result.activeRaces} active concurrently, 1 archived)`,
  );
  console.log(`      race point overrides ... ${result.raceProductPoints}`);
  console.log(`      batches ................ ${result.batches} (${result.completedBatches} completed, 2 running)`);
  console.log(`      pallet logs ............ ${result.palletLogs}`);
  console.log(`      point awards ........... ${result.pointAwards}`);
  console.log(`      ├─ of which fan-out .... ${result.concurrentAwards} (a pallet scoring in 2+ races)`);
  console.log(`      pause logs ............. ${result.pauseLogs}`);
  console.log('');
  console.log(
    verification.ok
      ? '    ✔ Ledger verified: every award belongs to a race that was open at logging time,'
      : '    ✖ Ledger verification FAILED — please report this.',
  );
  if (verification.ok) {
    console.log('      every pallet scored in every race that was open, and every race reconciles.');
  } else {
    console.log(`      attribution errors .. ${verification.attributionErrors}`);
    console.log(`      missing fan-out rows  ${verification.missingFanOut}`);
  }
  for (const entry of verification.perRace) {
    const marker = Math.abs(entry.delta) < 0.01 ? '✔' : '✖';
    console.log(
      `      ${marker} ${entry.raceName}: expected ${entry.expected}, actual ${entry.actual}` +
        (Math.abs(entry.delta) < 0.01 ? '' : ` (delta ${entry.delta})`),
    );
  }
  console.log('\n  ▸ Next: npm run dev, then open http://localhost:3000\n');
}

main().catch((error) => {
  console.error('\n  ✖ Seeding failed:\n', error);
  process.exit(1);
});
