/**
 * Daily production statistics.
 *
 * The daily screen is deliberately **pallet-first**: pallets are the unit the
 * floor actually counts and carries, so the headline figure and the primary
 * ranking are pallet counts, with cartons and points alongside.
 *
 * Everything is derived from the pallet ledger (which carries its own race,
 * product and batch) so a race reset mid-day never disturbs the day's numbers.
 */

import type {
  DailyHourStats,
  DailyLineStats,
  DailyProductStats,
  DailyStats,
  DailyWorkerStats,
  PauseLog,
  WorkerRef,
} from '@/lib/domain/types';
import { computeBatchStats } from '@/lib/domain/batch';
import { roundPoints, sumPoints } from '@/lib/domain/points';
import { formatDateKey } from '@/lib/domain/format';
import { batchWindow, clip, intersect, ms } from '@/lib/domain/intervals';
import { getRepository } from '@/lib/repo';
import { endOfDay, startOfDay } from '@/lib/utils/id';

/**
 * Builds the full daily picture for one local calendar day.
 *
 * @param date Any instant inside the target day. Defaults to today.
 */
export async function getDailyStats(date: Date = new Date(), now = Date.now()): Promise<DailyStats> {
  const repository = getRepository();

  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const dayWindow = { start: dayStart.getTime(), end: dayEnd.getTime() };

  const [allPallets, batches, workers, lines, pauses] = await Promise.all([
    repository.listPalletLogs({ limit: 100000 }),
    repository.listBatches({ limit: 100000 }),
    repository.listWorkers(),
    repository.listProductionLines(),
    repository.listPauseLogsInRange(dayStart.toISOString(), dayEnd.toISOString()),
  ]);

  // --- Pallets logged inside the day -------------------------------------
  const palletsToday = allPallets.filter((pallet) => {
    const at = ms(pallet.createdAt);
    return at >= dayWindow.start && at < dayWindow.end;
  });

  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));

  const products = await repository.listProducts();
  const productById = new Map(products.map((product) => [product.id, product]));

  /* ---------------------------------------------------------------------- */
  /*  Per product — the primary ranking                                      */
  /* ---------------------------------------------------------------------- */
  const productBuckets = new Map<
    string,
    { productId: string; pallets: number; cartons: number; points: number }
  >();

  for (const pallet of palletsToday) {
    const bucket = productBuckets.get(pallet.productId) ?? {
      productId: pallet.productId,
      pallets: 0,
      cartons: 0,
      points: 0,
    };
    bucket.pallets += 1;
    bucket.cartons += pallet.cartons;
    bucket.points += pallet.totalPoints;
    productBuckets.set(pallet.productId, bucket);
  }

  const totalPallets = palletsToday.length;

  const byProduct: DailyProductStats[] = [...productBuckets.values()]
    .map((bucket) => {
      const product = productById.get(bucket.productId);
      return {
        productId: bucket.productId,
        productName: product?.name ?? '—',
        sizeLabel: product?.sizeLabel ?? '—',
        pallets: bucket.pallets,
        cartons: bucket.cartons,
        points: roundPoints(bucket.points),
        share: totalPallets > 0 ? bucket.pallets / totalPallets : 0,
      } satisfies DailyProductStats;
    })
    .sort((a, b) => b.pallets - a.pallets || b.cartons - a.cartons);

  /* ---------------------------------------------------------------------- */
  /*  Per line                                                               */
  /* ---------------------------------------------------------------------- */
  const lineBuckets = new Map<
    string,
    { lineId: string; pallets: number; cartons: number; points: number; batchIds: Set<string> }
  >();

  for (const pallet of palletsToday) {
    const batch = batchById.get(pallet.batchId);
    const lineId = batch?.lineId ?? 'unknown';
    const bucket = lineBuckets.get(lineId) ?? {
      lineId,
      pallets: 0,
      cartons: 0,
      points: 0,
      batchIds: new Set<string>(),
    };
    bucket.pallets += 1;
    bucket.cartons += pallet.cartons;
    bucket.points += pallet.totalPoints;
    bucket.batchIds.add(pallet.batchId);
    lineBuckets.set(lineId, bucket);
  }

  // A line with a running batch but no pallets yet should still appear.
  for (const batch of batches) {
    if (batch.status !== 'ACTIVE') continue;
    if (!lineBuckets.has(batch.lineId)) {
      lineBuckets.set(batch.lineId, {
        lineId: batch.lineId,
        pallets: 0,
        cartons: 0,
        points: 0,
        batchIds: new Set([batch.id]),
      });
    }
  }

  const pausesByBatch = new Map<string, PauseLog[]>();
  for (const pause of pauses) {
    const list = pausesByBatch.get(pause.batchId) ?? [];
    list.push(pause);
    pausesByBatch.set(pause.batchId, list);
  }

  const byLine: DailyLineStats[] = [...lineBuckets.values()].map((bucket) => {
    const line = lines.find((candidate) => candidate.id === bucket.lineId);

    // Time accounting for every batch that overlapped the day on this line.
    let activeSeconds = 0;
    let pausedSeconds = 0;
    let batchesToday = 0;
    let batchesRunning = 0;

    for (const batch of batches) {
      if (batch.lineId !== bucket.lineId) continue;
      const span = batchWindow(batch.startedAt, batch.finishedAt, now);
      const overlap = intersect([span], [dayWindow])[0];
      if (!overlap || overlap.end <= overlap.start) continue;

      const batchPauses = pausesByBatch.get(batch.id) ?? [];
      // Only the part of each pause that falls inside the day counts, so a
      // stoppage that began yesterday does not distort today's numbers.
      const pauseSeconds = batchPauses.reduce((sum, pause) => {
        const pauseSpan = {
          start: ms(pause.startedAt),
          end: pause.endedAt ? ms(pause.endedAt) : now,
        };
        const clipped = clip([pauseSpan], overlap)[0];
        return clipped ? sum + Math.round((clipped.end - clipped.start) / 1000) : sum;
      }, 0);

      const elapsed = Math.round((overlap.end - overlap.start) / 1000);
      pausedSeconds += pauseSeconds;
      activeSeconds += Math.max(0, elapsed - pauseSeconds);

      batchesToday += 1;
      if (batch.status === 'ACTIVE') batchesRunning += 1;
    }

    return {
      lineId: bucket.lineId,
      lineName: line?.name ?? '—',
      lineCode: line?.code ?? '?',
      pallets: bucket.pallets,
      cartons: bucket.cartons,
      points: roundPoints(bucket.points),
      activeSeconds,
      pausedSeconds,
      batches: batchesToday,
      batchesRunning,
    } satisfies DailyLineStats;
  });

  // Ordered by the supervisor's line order, then by output.
  byLine.sort((a, b) => {
    const lineA = lines.find((line) => line.id === a.lineId);
    const lineB = lines.find((line) => line.id === b.lineId);
    return (lineA?.sortOrder ?? 999) - (lineB?.sortOrder ?? 999);
  });

  /* ---------------------------------------------------------------------- */
  /*  Per hour — the day's production curve                                  */
  /* ---------------------------------------------------------------------- */
  const hourBuckets = new Map<number, DailyHourStats>();
  for (let hour = 0; hour < 24; hour += 1) {
    hourBuckets.set(hour, { hour, pallets: 0, cartons: 0 });
  }
  for (const pallet of palletsToday) {
    const hour = new Date(pallet.createdAt).getHours();
    const bucket = hourBuckets.get(hour);
    if (!bucket) continue;
    bucket.pallets += 1;
    bucket.cartons += pallet.cartons;
  }

  /* ---------------------------------------------------------------------- */
  /*  Top workers today                                                      */
  /* ---------------------------------------------------------------------- */
  const awardsToday = await repository.listPointAwards({
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
  });

  const workerBuckets = new Map<string, { points: number; pallets: number }>();
  for (const award of awardsToday) {
    const bucket = workerBuckets.get(award.workerId) ?? { points: 0, pallets: 0 };
    bucket.points += award.points;
    bucket.pallets += 1;
    workerBuckets.set(award.workerId, bucket);
  }

  const cartonsByWorker = new Map<string, number>();
  for (const pallet of palletsToday) {
    const batch = batchById.get(pallet.batchId);
    if (!batch) continue;
    const memberships = await repository.listBatchMembers(pallet.batchId);
    const at = ms(pallet.createdAt);
    const present = memberships.filter(
      (member) => ms(member.joinedAt) <= at && (member.leftAt === null || ms(member.leftAt) > at),
    );
    if (present.length === 0) continue;
    const share = pallet.cartons / present.length;
    for (const member of present) {
      cartonsByWorker.set(member.workerId, (cartonsByWorker.get(member.workerId) ?? 0) + share);
    }
  }

  const activeSecondsByWorker = new Map<string, number>();
  for (const batch of batches) {
    const span = batchWindow(batch.startedAt, batch.finishedAt, now);
    const overlap = intersect([span], [dayWindow])[0];
    if (!overlap || overlap.end <= overlap.start) continue;

    const memberships = await repository.listBatchMembers(batch.id);
    const batchPauses = pausesByBatch.get(batch.id) ?? [];
    const pauseSpans = batchPauses.map((pause) => ({
      start: ms(pause.startedAt),
      end: pause.endedAt ? ms(pause.endedAt) : now,
    }));

    for (const member of memberships) {
      const membershipSpan = {
        start: ms(member.joinedAt),
        end: member.leftAt ? ms(member.leftAt) : overlap.end,
      };
      const clippedMembership = intersect([membershipSpan], [overlap])[0];
      if (!clippedMembership) continue;

      const elapsed = (clippedMembership.end - clippedMembership.start) / 1000;
      const pauseInside = pauseSpans.reduce((sum, pauseSpan) => {
        const clipped = intersect([pauseSpan], [clippedMembership])[0];
        return clipped ? sum + (clipped.end - clipped.start) / 1000 : sum;
      }, 0);

      const seconds = Math.max(0, Math.round(elapsed - pauseInside));
      activeSecondsByWorker.set(
        member.workerId,
        (activeSecondsByWorker.get(member.workerId) ?? 0) + seconds,
      );
    }
  }

  const toWorkerRef = (workerId: string): WorkerRef => {
    const worker = workerById.get(workerId);
    return {
      workerId,
      fullName: worker?.fullName ?? '—',
      employeeId: worker?.employeeId ?? '—',
      emoji: worker?.emoji ?? '👤',
    };
  };

  const topWorkers: DailyWorkerStats[] = [...workerBuckets.entries()]
    .map(([workerId, bucket]) => ({
      worker: toWorkerRef(workerId),
      points: roundPoints(bucket.points),
      pallets: bucket.pallets,
      cartons: Math.round(cartonsByWorker.get(workerId) ?? 0),
      activeSeconds: activeSecondsByWorker.get(workerId) ?? 0,
    }))
    .sort((a, b) => b.points - a.points || b.pallets - a.pallets)
    .slice(0, 10);

  /* ---------------------------------------------------------------------- */
  /*  Day totals                                                             */
  /* ---------------------------------------------------------------------- */
  const batchesToday = batches.filter((batch) => {
    const started = ms(batch.startedAt);
    if (started >= dayWindow.start && started < dayWindow.end) return true;
    // A batch still running, started earlier, also belongs to today's picture.
    return batch.status === 'ACTIVE';
  });

  const totalActiveSeconds = byLine.reduce((sum, line) => sum + line.activeSeconds, 0);
  const totalPausedSeconds = byLine.reduce((sum, line) => sum + line.pausedSeconds, 0);

  return {
    dateKey: formatDateKey(dayStart),
    generatedAt: new Date(now).toISOString(),
    totals: {
      pallets: totalPallets,
      cartons: palletsToday.reduce((sum, pallet) => sum + pallet.cartons, 0),
      points: sumPoints(palletsToday.map((pallet) => pallet.totalPoints)),
      batches: batchesToday.length,
      batchesCompleted: batchesToday.filter((batch) => batch.status === 'COMPLETED').length,
      batchesRunning: batchesToday.filter((batch) => batch.status === 'ACTIVE').length,
      activeSeconds: totalActiveSeconds,
      pausedSeconds: totalPausedSeconds,
      workersOnFloor: workerBuckets.size,
    },
    byProduct,
    byLine,
    byHour: [...hourBuckets.values()],
    topWorkers,
  };
}

/**
 * Convenience wrapper used by the TV Mode loop: today's pallet count per
 * product, already sorted.
 */
export async function getTodayProductPallets(): Promise<DailyProductStats[]> {
  const stats = await getDailyStats();
  return stats.byProduct;
}

/** Re-exported so route handlers do not reach into the domain layer directly. */
export { computeBatchStats };
