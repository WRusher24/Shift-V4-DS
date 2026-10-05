/**
 * Race leaderboard computation.
 *
 * Two independent rankings are produced from the same underlying ledger:
 *
 *   Volume (נפח)      — total points accumulated inside the race.
 *   Efficiency (יעילות) — points divided by *active* working hours (PPH).
 *
 * Race attribution is read straight off the ledger: every `point_award` carries
 * its own `raceId`, and one award is written per (worker × race that was ACTIVE
 * when the pallet was logged). Three consequences follow, and all of them matter:
 *
 *   - Opening a new race needs no destructive write. No award carries the new
 *     race id yet, so every counter starts at zero — and the next pallet logged
 *     on any line contributes to it, because the fan-out only looks at which
 *     races are ACTIVE at that moment.
 *   - A batch is not tied to a race, so one batch legitimately appears on several
 *     boards at once, each computed from its own award rows.
 *   - Each race applies its own point multiplier, so the same pallet can be worth
 *     different amounts in different races.
 *
 * The minimum-hours threshold exists to remove hour-stuffing bias: a worker who
 * only logged a couple of very productive hours cannot win the efficiency prize
 * unless they clear `race.minActiveHours`. Disqualified workers are still shown,
 * ranked below qualified ones, with an explicit reason.
 */

import type {
  Batch,
  BatchMember,
  LeaderboardRow,
  PalletLog,
  PauseLog,
  PointAward,
  Race,
  RaceLeaderboard,
  Worker,
  WorkerRef,
} from '@/lib/domain/types';
import { activeSecondsForWorker, batchWindow, clip, intersect, ms, type Interval } from '@/lib/domain/intervals';
import { pointsPerHour, roundPoints, sumPoints, toMilli } from '@/lib/domain/points';

export interface LeaderboardInput {
  race: Race | null;
  workers: Worker[];
  /** Every batch that may have contributed. Rows outside the race are ignored. */
  batches: Batch[];
  members: BatchMember[];
  /** All pallets; those with a different `raceId` are ignored. */
  pallets: PalletLog[];
  pauses: PauseLog[];
  /** All awards; those with a different `raceId` are ignored. */
  awards: PointAward[];
  now?: number;
}

interface Accumulator {
  workerId: string;
  pointsMilli: number;
  cartonsMilli: number;
  palletsMilli: number;
  activeSeconds: number;
  batchIds: Set<string>;
}

function ensure(map: Map<string, Accumulator>, workerId: string): Accumulator {
  let accumulator = map.get(workerId);
  if (!accumulator) {
    accumulator = {
      workerId,
      pointsMilli: 0,
      cartonsMilli: 0,
      palletsMilli: 0,
      activeSeconds: 0,
      batchIds: new Set<string>(),
    };
    map.set(workerId, accumulator);
  }
  return accumulator;
}

/**
 * Cartons/pallets are attributed fractionally using exactly the same split as
 * the points: a pallet of 28 cartons shared by 4 members credits each of them
 * with 7 cartons. Summed back up, the numbers reconcile with the batch totals.
 */
function splitQuantity(total: number, memberCount: number): number {
  if (memberCount <= 0) return 0;
  return total / memberCount;
}

export function computeRaceLeaderboard(input: LeaderboardInput): RaceLeaderboard {
  const now = input.now ?? Date.now();
  const minActiveHours = input.race?.minActiveHours ?? 0;
  const raceId = input.race?.id ?? null;

  const workersById = new Map(input.workers.map((worker) => [worker.id, worker]));

  /* ---------------------------------------------------------------------- */
  /*  Scope every row to the race, using the ledger's own race stamps.       */
  /* ---------------------------------------------------------------------- */

  // The ledger is the only place race attribution exists: a pallet belongs to a
  // race because awards were written for it, not because the pallet or its batch
  // carries a race id. So the pallet set is derived from the award rows.
  const raceAwards = raceId ? input.awards.filter((award) => award.raceId === raceId) : input.awards;
  const racePalletIds = new Set(raceAwards.map((award) => award.palletLogId));
  const racePallets = input.pallets.filter((pallet) => racePalletIds.has(pallet.id));

  const batchIds = new Set<string>();
  for (const pallet of racePallets) batchIds.add(pallet.batchId);
  for (const award of raceAwards) batchIds.add(award.batchId);

  const batchById = new Map(input.batches.map((batch) => [batch.id, batch]));

  const membersByBatch = new Map<string, BatchMember[]>();
  for (const member of input.members) {
    if (!batchIds.has(member.batchId)) continue;
    const list = membersByBatch.get(member.batchId) ?? [];
    list.push(member);
    membersByBatch.set(member.batchId, list);
  }

  const pausesByBatch = new Map<string, PauseLog[]>();
  for (const pause of input.pauses) {
    if (!batchIds.has(pause.batchId)) continue;
    const list = pausesByBatch.get(pause.batchId) ?? [];
    list.push(pause);
    pausesByBatch.set(pause.batchId, list);
  }

  const accumulators = new Map<string, Accumulator>();

  /* ---------------------------------------------------------------------- */
  /*  1. Points — straight from the immutable ledger.                        */
  /* ---------------------------------------------------------------------- */
  for (const award of raceAwards) {
    const accumulator = ensure(accumulators, award.workerId);
    accumulator.pointsMilli += toMilli(award.points);
  }

  /* ---------------------------------------------------------------------- */
  /*  2. Cartons / pallets — fractional split across members on the clock.    */
  /* ---------------------------------------------------------------------- */
  for (const pallet of racePallets) {
    const batchMembers = membersByBatch.get(pallet.batchId) ?? [];
    const at = ms(pallet.createdAt);

    const active = batchMembers.filter(
      (member) => ms(member.joinedAt) <= at && (member.leftAt === null || ms(member.leftAt) > at),
    );
    // Fall back to "everyone who ever touched the batch" when a pallet has a
    // timestamp that predates the membership rows (imported history), so no
    // cartons are silently dropped.
    const recipients = active.length > 0 ? active : batchMembers;
    if (recipients.length === 0) continue;

    const cartonsShare = splitQuantity(pallet.cartons, recipients.length);
    const palletShare = splitQuantity(1, recipients.length);

    for (const member of recipients) {
      const accumulator = ensure(accumulators, member.workerId);
      accumulator.cartonsMilli += Math.round(cartonsShare * 1000);
      accumulator.palletsMilli += Math.round(palletShare * 1000);
      accumulator.batchIds.add(pallet.batchId);
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  3. Active working time — membership intervals minus pause intervals,    */
  /*     both clipped to the intersection of the batch and the race window.   */
  /* ---------------------------------------------------------------------- */
  const raceWindow: Interval | null = input.race
    ? {
        start: ms(input.race.startAt),
        end: input.race.endAt ? ms(input.race.endAt) : now,
      }
    : null;

  for (const batchId of batchIds) {
    const batch = batchById.get(batchId);
    if (!batch) continue;

    const batchSpan = batchWindow(batch.startedAt, batch.finishedAt, now);
    const window = raceWindow ? intersect([batchSpan], [raceWindow])[0] : batchSpan;
    if (!window || window.end <= window.start) continue;

    const batchMembers = membersByBatch.get(batchId) ?? [];
    const pauseIntervals: Interval[] = (pausesByBatch.get(batchId) ?? []).map((pause) => ({
      start: ms(pause.startedAt),
      end: pause.endedAt ? ms(pause.endedAt) : now,
    }));

    for (const member of batchMembers) {
      const membership: Interval[] = [
        {
          start: ms(member.joinedAt),
          end: member.leftAt ? ms(member.leftAt) : window.end,
        },
      ];
      const seconds = activeSecondsForWorker(membership, pauseIntervals, window);
      if (seconds <= 0) continue;

      const accumulator = ensure(accumulators, member.workerId);
      accumulator.activeSeconds += seconds;
      accumulator.batchIds.add(batchId);
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  4. Materialise rows.                                                   */
  /* ---------------------------------------------------------------------- */
  const toWorkerRef = (workerId: string): WorkerRef => {
    const worker = workersById.get(workerId);
    return {
      workerId,
      fullName: worker?.fullName ?? '—',
      employeeId: worker?.employeeId ?? '—',
      emoji: worker?.emoji ?? '👤',
    };
  };

  const rows: LeaderboardRow[] = [...accumulators.values()].map((accumulator) => {
    const points = roundPoints(accumulator.pointsMilli / 1000);
    const activeHours = accumulator.activeSeconds / 3600;
    const qualified = minActiveHours <= 0 ? true : activeHours >= minActiveHours;
    const missingHours = Math.max(0, minActiveHours - activeHours);

    return {
      rank: 0,
      worker: toWorkerRef(accumulator.workerId),
      points,
      cartons: Math.round(accumulator.cartonsMilli / 1000),
      pallets: Math.round(accumulator.palletsMilli / 1000),
      batches: accumulator.batchIds.size,
      activeSeconds: accumulator.activeSeconds,
      activeHours: roundPoints(activeHours),
      pointsPerHour: pointsPerHour(points, accumulator.activeSeconds),
      qualified,
      disqualifiedReason: qualified
        ? null
        : `חסרות ${roundPoints(missingHours).toFixed(2)} שעות פעילות לזכאות`,
    } satisfies LeaderboardRow;
  });

  const byVolume = rankRows(rows, (a, b) => b.points - a.points);
  const byEfficiency = rankRows(rows, (a, b) => {
    if (b.pointsPerHour !== a.pointsPerHour) return b.pointsPerHour - a.pointsPerHour;
    return b.points - a.points;
  });

  return {
    race: input.race,
    generatedAt: new Date(now).toISOString(),
    minActiveHours,
    byVolume,
    byEfficiency,
    totals: {
      points: sumPoints(rows.map((row) => row.points)),
      cartons: racePallets.reduce((sum, pallet) => sum + pallet.cartons, 0),
      pallets: racePallets.length,
      batches: batchIds.size,
      activeSeconds: rows.reduce((sum, row) => sum + row.activeSeconds, 0),
      workers: rows.length,
      qualifiedWorkers: rows.filter((row) => row.qualified).length,
    },
  };
}

/**
 * Sort and number rows. Qualified workers always outrank disqualified ones so
 * the visible top of the board is always prize-eligible.
 */
function rankRows(
  rows: LeaderboardRow[],
  comparator: (a: LeaderboardRow, b: LeaderboardRow) => number,
): LeaderboardRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    const byMetric = comparator(a, b);
    if (byMetric !== 0) return byMetric;
    return a.worker.fullName.localeCompare(b.worker.fullName, 'he');
  });

  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Convenience helper used by the TV Mode ticker and the dashboard sidebar. */
export function topRows(
  leaderboard: RaceLeaderboard,
  category: 'volume' | 'efficiency',
  limit = 5,
): LeaderboardRow[] {
  const source = category === 'volume' ? leaderboard.byVolume : leaderboard.byEfficiency;
  return source.slice(0, limit);
}

/** Exported for the daily screen, which reuses the same clipping rules. */
export { clip };
