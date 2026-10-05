/**
 * Standalone seed + ledger verification.
 *
 * Runs the seed generator against a throwaway local store, then asserts the
 * fan-out ledger. This is the fastest way to validate changes to the seed or to
 * the attribution rules without starting a server, and it is what CI should run.
 *
 * Usage:
 *   npm run verify:seed
 */

import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Point the local store at a throwaway file BEFORE anything imports the
// repository, so the real `.data` store is never touched.
const SCRATCH = resolve(process.cwd(), '.data', 'seed-verify.json');
process.env.SHIFT_FORCE_LOCAL_STORE = 'true';
process.env.SHIFT_LOCAL_STORE_PATH = SCRATCH;

function cleanup(): void {
  if (existsSync(SCRATCH)) {
    try {
      rmSync(SCRATCH, { force: true });
    } catch {
      /* best effort */
    }
  }
}

async function main(): Promise<void> {
  cleanup();

  const { getRepository } = await import('../lib/repo/index');
  const { seedDatabase, verifySeedLedger } = await import('../lib/services/seed');

  const repository = getRepository();
  console.log(`\n  ▸ Verifying seed against ${repository.describe()}\n`);

  const started = Date.now();
  const result = await seedDatabase({ reset: true });
  const elapsed = Date.now() - started;

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

  let failed = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    if (ok) {
      console.log(`    ✔ ${name}`);
    } else {
      failed += 1;
      console.log(`    ✖ ${name}${detail ? ` — ${detail}` : ''}`);
    }
  };

  console.log(`    seed generated in ${elapsed} ms`);
  console.log('');
  console.log(`      workers ................ ${result.workers}`);
  console.log(`      production lines ....... ${result.lines}`);
  console.log(`      products ............... ${result.products}`);
  console.log(`      pallet sizes ........... ${result.palletSizes}`);
  console.log(`      races .................. ${result.races} (${result.activeRaces} active, 1 archived)`);
  console.log(`      batches ................ ${result.batches}`);
  console.log(`      pallet logs ............ ${result.palletLogs}`);
  console.log(`      point awards ........... ${result.pointAwards}`);
  console.log(`      ├─ fan-out rows ....... ${result.concurrentAwards}`);
  console.log(`      pause logs ............. ${result.pauseLogs}`);
  console.log('');

  console.log('  · structure');
  check('generated a crew', result.workers >= 10, `${result.workers}`);
  check('generated at least two production lines', result.lines >= 2, `${result.lines}`);
  check('generated two concurrent ACTIVE races', result.activeRaces === 2, `${result.activeRaces}`);
  check('generated an archived race', races.some((race) => race.status === 'FINISHED'));
  check('exactly one primary race', races.filter((race) => race.isPrimary).length === 1);
  check('generated pallets', result.palletLogs > 0, `${result.palletLogs}`);
  check('generated point awards', result.pointAwards > 0, `${result.pointAwards}`);

  console.log('\n  · fan-out');
  check(
    'some pallets scored in more than one race (fan-out actually happened)',
    result.concurrentAwards > 0,
    `${result.concurrentAwards} extra award rows`,
  );
  check(
    'award count exceeds a single-race baseline',
    result.pointAwards > result.palletLogs,
    `${result.pointAwards} awards vs ${result.palletLogs} pallets`,
  );

  console.log('\n  · ledger integrity');
  check(
    'every award belongs to a race that was open at logging time',
    verification.attributionErrors === 0,
    `${verification.attributionErrors} errors`,
  );
  check(
    'every pallet scored in every race that was open (no missing fan-out rows)',
    verification.missingFanOut === 0,
    `${verification.missingFanOut} pallets incomplete`,
  );

  console.log('\n  · per-race reconciliation');
  for (const entry of verification.perRace) {
    const ok = Math.abs(entry.delta) < 0.01;
    check(
      `${entry.raceName}: ${entry.expected} points`,
      ok,
      ok ? '' : `expected ${entry.expected}, actual ${entry.actual}`,
    );
    if (entry.actual === 0) {
      // An empty race is not an error in general, but in the seeded dataset every
      // race must have scored — otherwise the demo data looks broken.
      check(`${entry.raceName}: accumulated points`, entry.actual > 0, 'race has no points');
    }
  }

  console.log(
    failed === 0
      ? '\n  ✔ Seed verification passed.\n'
      : `\n  ✖ Seed verification FAILED (${failed} checks).\n`,
  );

  cleanup();
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('\n  ✖ Seed verification crashed:\n', error);
  cleanup();
  process.exit(1);
});
