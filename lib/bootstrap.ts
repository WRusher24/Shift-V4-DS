/**
 * First-boot bootstrap.
 *
 * When the application runs on the local JSON store and that store is empty,
 * the demo dataset is generated automatically. The result is a project that is
 * fully explorable — crew, products, a live race, two weeks of history and one
 * batch running right now — with nothing more than `npm install && npm run dev`.
 *
 * This never runs against PostgreSQL: a production database is populated
 * explicitly via `npm run db:seed`, so a live factory can never be
 * surprise-seeded.
 */

import { getRepository, shouldUseLocalStore } from '@/lib/repo';
import { seedDatabase } from '@/lib/services/seed';

let bootstrapPromise: Promise<void> | null = null;

async function runBootstrap(): Promise<void> {
  if (!shouldUseLocalStore()) return;

  try {
    const repository = getRepository();
    const [workers, races, lines] = await Promise.all([
      repository.listWorkers(),
      repository.listRaces(),
      repository.listProductionLines(),
    ]);

    // Any of these being empty means the store is not usable as a factory.
    if (workers.length === 0 && races.length === 0 && lines.length === 0) {
      console.info('[shift] Empty local store detected — generating the demo dataset.');
      const result = await seedDatabase({ reset: false });
      console.info(
        `[shift] Demo data ready: ${result.workers} workers, ${result.lines} lines, ` +
          `${result.products} products, ${result.activeRaces} active races, ` +
          `${result.completedBatches} completed batches, ${result.palletLogs} pallets.`,
      );
      return;
    }

    // Partially populated store (e.g. after a manual truncate): repair the two
    // things the floor cannot operate without.
    const { ensureDefaultLines } = await import('@/lib/services/lines');
    const { ensurePrimaryRace } = await import('@/lib/services/races');

    await ensureDefaultLines();
    await ensurePrimaryRace();
  } catch (error) {
    console.error('[shift] Automatic seeding failed. Run `npm run db:seed` manually.', error);
  }
}

/**
 * Idempotent: concurrent callers await the same promise, so a burst of
 * parallel requests at boot cannot produce a double seed.
 */
export function ensureSeeded(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap();
  }
  return bootstrapPromise;
}
