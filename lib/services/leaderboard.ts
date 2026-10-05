/**
 * Leaderboard read model.
 *
 * Loads exactly the rows belonging to one race and hands them to the pure
 * computation in `lib/domain/leaderboard.ts`.
 *
 * Because the ledger is the only place race attribution lives, the pallet set
 * for a race is derived from that race's award rows — a direct indexed lookup on
 * `point_awards.race_id`. No join back through the batch, and a batch that
 * contributed to several concurrent races appears correctly on every one of
 * their boards.
 */

import type { RaceLeaderboard } from '@/lib/domain/types';
import { computeRaceLeaderboard } from '@/lib/domain/leaderboard';
import { ensureSeeded } from '@/lib/bootstrap';
import { getRepository } from '@/lib/repo';
import { getNumberSetting } from '@/lib/services/settings';
import { SETTING_KEYS } from '@/lib/db/schema';

const EMPTY_TOTALS = {
  points: 0,
  cartons: 0,
  pallets: 0,
  batches: 0,
  activeSeconds: 0,
  workers: 0,
  qualifiedWorkers: 0,
};

/**
 * Builds the standings for a race.
 *
 * When `raceId` is omitted the **primary** race is used. When there is no active
 * race at all, an empty board is returned rather than an error, so the UI can
 * render a friendly empty state.
 */
export async function getRaceLeaderboard(raceId?: string, now = Date.now()): Promise<RaceLeaderboard> {
  await ensureSeeded();

  const repository = getRepository();
  const race = raceId ? await repository.getRaceById(raceId) : await repository.getPrimaryRace();

  if (!race) {
    const minActiveHours = await getNumberSetting(SETTING_KEYS.MIN_RACE_HOURS, 30);
    return {
      race: null,
      generatedAt: new Date(now).toISOString(),
      minActiveHours,
      byVolume: [],
      byEfficiency: [],
      totals: { ...EMPTY_TOTALS },
    };
  }

  const [workers, awards] = await Promise.all([
    repository.listWorkers(),
    repository.listPointAwards({ raceId: race.id }),
  ]);

  // Pallets belonging to this race, resolved through the ledger.
  const palletIds = [...new Set(awards.map((award) => award.palletLogId))];
  const pallets = await repository.listPalletLogsByIds(palletIds);

  // Batches that contributed to this race, also resolved from the ledger.
  const batchIds = new Set<string>();
  for (const award of awards) batchIds.add(award.batchId);
  for (const pallet of pallets) batchIds.add(pallet.batchId);

  const allBatches = await repository.listBatches({ limit: 100000 });
  const batches = allBatches.filter((batch) => batchIds.has(batch.id));
  const contributingIds = batches.map((batch) => batch.id);

  const [members, pauses] = await Promise.all([
    repository.listBatchMembersForBatches(contributingIds),
    repository.listPauseLogsForBatches(contributingIds),
  ]);

  return computeRaceLeaderboard({ race, workers, batches, members, pallets, pauses, awards, now });
}

/**
 * Career totals across every race — shown on the history screen so a new race
 * does not make long-serving workers look like beginners.
 */
export async function getCareerTotals(now = Date.now()): Promise<
  Array<{
    workerId: string;
    fullName: string;
    emoji: string;
    points: number;
    cartons: number;
    activeSeconds: number;
  }>
> {
  const repository = getRepository();
  const [workers, batches, awards, pallets] = await Promise.all([
    repository.listWorkers(),
    repository.listBatches({ limit: 100000 }),
    repository.listPointAwards(),
    repository.listPalletLogs({ limit: 100000 }),
  ]);

  const leaderboard = computeRaceLeaderboard({
    race: null,
    workers,
    batches,
    members: await repository.listBatchMembersForBatches(batches.map((batch) => batch.id)),
    pallets,
    pauses: [],
    awards,
    now,
  });

  return leaderboard.byVolume.map((row) => ({
    workerId: row.worker.workerId,
    fullName: row.worker.fullName,
    emoji: row.worker.emoji,
    points: row.points,
    cartons: row.cartons,
    activeSeconds: row.activeSeconds,
  }));
}
