/**
 * History ledger and report builders.
 *
 * Everything here is read-only and returns plain objects that are trivially
 * serialisable — either as JSON to the client or as CSV to the operator's
 * Downloads folder.
 */

import type {
  Batch,
  BatchHistoryRow,
  DowntimeReportRow,
  PalletLog,
  Product,
  ProductionLine,
  Race,
  Worker,
  WorkerSummaryReportRow,
} from '@/lib/domain/types';
import { buildPauseBreakdown, computeBatchStats } from '@/lib/domain/batch';
import { computeRaceLeaderboard } from '@/lib/domain/leaderboard';
import { roundPoints } from '@/lib/domain/points';
import { formatDateKey } from '@/lib/domain/format';
import { ensureSeeded } from '@/lib/bootstrap';
import { getRepository } from '@/lib/repo';
import { pauseReasonLabel } from '@/lib/i18n/he';

export interface HistoryFilter {
  from?: string;
  to?: string;
  productId?: string;
  workerId?: string;
  /** Only batches that contributed points to this race. */
  raceId?: string;
  lineId?: string;
  status?: Batch['status'];
  limit?: number;
}

export interface HistoryBundle {
  rows: BatchHistoryRow[];
  workers: Worker[];
  products: Product[];
  races: Race[];
  lines: ProductionLine[];
}

/**
 * Loads the ledger. Members, pauses and point awards are fetched in bulk (three
 * queries for the whole window) and then grouped in memory, which keeps the
 * request count constant no matter how many batches are displayed.
 */
export async function getHistory(filter: HistoryFilter = {}, now = Date.now()): Promise<HistoryBundle> {
  await ensureSeeded();

  const repository = getRepository();

  const [workers, products, races, lines] = await Promise.all([
    repository.listWorkers(),
    repository.listProducts(),
    repository.listRaces(),
    repository.listProductionLines(),
  ]);

  // Race scoping is resolved through the ledger: a batch belongs to a race
  // because it has award rows stamped with it, not because it carries a race id.
  let allowedBatchIds: Set<string> | null = null;
  if (filter.raceId) {
    const raceAwards = await repository.listPointAwards({ raceId: filter.raceId });
    allowedBatchIds = new Set(raceAwards.map((award) => award.batchId));
  }

  const batches = await repository.listBatches({
    ...(filter.status ? { status: filter.status } : { status: 'COMPLETED' }),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
    ...(filter.productId ? { productId: filter.productId } : {}),
    ...(filter.lineId ? { lineId: filter.lineId } : {}),
    ...(filter.limit ? { limit: filter.limit } : {}),
  });

  const scopedBatches = allowedBatchIds
    ? batches.filter((batch) => allowedBatchIds!.has(batch.id))
    : batches;

  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const raceById = new Map(races.map((race) => [race.id, race]));
  const lineById = new Map(lines.map((line) => [line.id, line]));

  const batchIds = scopedBatches.map((batch) => batch.id);
  const [members, pallets, pauses, awards] = await Promise.all([
    repository.listBatchMembersForBatches(batchIds),
    repository.listPalletLogsForBatches(batchIds),
    repository.listPauseLogsForBatches(batchIds),
    repository.listPointAwardsForBatches(batchIds),
  ]);

  const membersByBatch = groupBy(members, (member) => member.batchId);
  const palletsByBatch = groupBy(pallets, (pallet) => pallet.batchId);
  const pausesByBatch = groupBy(pauses, (pause) => pause.batchId);

  // Which races each batch contributed to — a batch may appear on several.
  const raceIdsByBatch = new Map<string, Set<string>>();
  for (const award of awards) {
    const set = raceIdsByBatch.get(award.batchId) ?? new Set<string>();
    set.add(award.raceId);
    raceIdsByBatch.set(award.batchId, set);
  }

  let rows: BatchHistoryRow[] = scopedBatches.map((batch) => {
    const batchMembers = membersByBatch.get(batch.id) ?? [];
    const batchPallets = palletsByBatch.get(batch.id) ?? [];
    const batchPauses = pausesByBatch.get(batch.id) ?? [];
    const product = productById.get(batch.productId);
    const stats = computeBatchStats(batch, batchPauses, batchPallets, now);

    const teamRefs = dedupeBy(batchMembers, (member) => member.workerId).map((member) => {
      const worker = workerById.get(member.workerId);
      return {
        workerId: member.workerId,
        fullName: worker?.fullName ?? '—',
        employeeId: worker?.employeeId ?? '—',
        emoji: worker?.emoji ?? '👤',
      };
    });

    const raceNames = [...(raceIdsByBatch.get(batch.id) ?? [])]
      .map((raceId) => raceById.get(raceId)?.name)
      .filter((name): name is string => Boolean(name));

    return {
      batch,
      line: lineById.get(batch.lineId) ?? null,
      product:
        product ??
        ({
          id: batch.productId,
          name: '—',
          sku: null,
          sizeLabel: '—',
          cartonsPerLayout: 0,
          pointValue: 0,
          isActive: false,
          createdAt: batch.createdAt,
        } satisfies Product),
      raceNames,
      startedAt: batch.startedAt,
      finishedAt: batch.finishedAt,
      totalElapsedSeconds: batch.totalElapsedSeconds ?? stats.elapsedSeconds,
      activeSeconds: batch.activeSeconds ?? stats.activeSeconds,
      pausedSeconds: batch.pausedSeconds ?? stats.pausedSeconds,
      palletCount: batchPallets.length,
      totalCartons: batch.totalCartons ?? stats.totalCartons,
      totalPoints: roundPoints(batch.totalPoints ?? stats.totalPoints),
      members: teamRefs,
      pauseBreakdown: buildPauseBreakdown(batchPauses, now),
      dateKey: formatDateKey(batch.startedAt),
    } satisfies BatchHistoryRow;
  });

  // Worker filter is applied after assembly because it depends on membership.
  if (filter.workerId) {
    rows = rows.filter((row) => row.members.some((member) => member.workerId === filter.workerId));
  }

  return { rows, workers, products, races, lines };
}

/** Downtime grouped by reason, for the payroll / maintenance review. */
export async function getDowntimeReport(
  from?: string,
  to?: string,
  now = Date.now(),
): Promise<DowntimeReportRow[]> {
  const repository = getRepository();
  const batches = await repository.listBatches({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    limit: 100000,
  });

  const batchIds = batches.map((batch) => batch.id);
  const pauses = await repository.listPauseLogsForBatches(batchIds);

  const buckets = new Map<
    string,
    {
      reasonCode: DowntimeReportRow['reasonCode'];
      reasonLabel: string | null;
      occurrences: number;
      totalSeconds: number;
      batchIds: Set<string>;
    }
  >();

  for (const pause of pauses) {
    const duration =
      pause.durationSeconds ??
      (pause.endedAt
        ? Math.max(0, Math.round((new Date(pause.endedAt).getTime() - new Date(pause.startedAt).getTime()) / 1000))
        : Math.max(0, Math.round((now - new Date(pause.startedAt).getTime()) / 1000)));

    const bucket = buckets.get(pause.reasonCode) ?? {
      reasonCode: pause.reasonCode,
      reasonLabel: pause.reasonLabel,
      occurrences: 0,
      totalSeconds: 0,
      batchIds: new Set<string>(),
    };

    bucket.occurrences += 1;
    bucket.totalSeconds += duration;
    bucket.batchIds.add(pause.batchId);
    buckets.set(pause.reasonCode, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      reasonCode: bucket.reasonCode,
      reasonLabel: bucket.reasonLabel ?? pauseReasonLabel(bucket.reasonCode),
      occurrences: bucket.occurrences,
      totalSeconds: bucket.totalSeconds,
      averageSeconds: bucket.occurrences > 0 ? Math.round(bucket.totalSeconds / bucket.occurrences) : 0,
      affectedBatches: bucket.batchIds.size,
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

/** Per-worker point and efficiency summary used for payroll review. */
export async function getWorkerSummary(
  from?: string,
  to?: string,
  now = Date.now(),
): Promise<WorkerSummaryReportRow[]> {
  const repository = getRepository();
  const [workers, batches] = await Promise.all([
    repository.listWorkers(),
    repository.listBatches({ ...(from ? { from } : {}), ...(to ? { to } : {}), limit: 100000 }),
  ]);

  const batchIds = batches.map((batch) => batch.id);
  const [members, pallets, pauses, awards] = await Promise.all([
    repository.listBatchMembersForBatches(batchIds),
    repository.listPalletLogsForBatches(batchIds),
    repository.listPauseLogsForBatches(batchIds),
    repository.listPointAwardsForBatches(batchIds),
  ]);

  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const membersByBatch = groupBy(members, (member) => member.batchId);
  const pausesByBatch = groupBy(pauses, (pause) => pause.batchId);

  // Reuse the leaderboard maths for points, cartons and active time.
  const board = computeRaceLeaderboard({
    race: null,
    workers,
    batches,
    members,
    pallets,
    pauses,
    awards,
    now,
  });

  // Pause exposure per worker: each pause is charged to every member present.
  const pauseSecondsByWorker = new Map<string, number>();
  for (const batch of batches) {
    const batchMembers = membersByBatch.get(batch.id) ?? [];
    const batchPauses = pausesByBatch.get(batch.id) ?? [];
    for (const pause of batchPauses) {
      const start = new Date(pause.startedAt).getTime();
      const end = pause.endedAt ? new Date(pause.endedAt).getTime() : now;
      const duration = Math.max(0, Math.round((end - start) / 1000));
      const present = batchMembers.filter(
        (member) =>
          new Date(member.joinedAt).getTime() <= end &&
          (member.leftAt === null || new Date(member.leftAt).getTime() >= start),
      );
      if (present.length === 0) continue;
      const share = duration / present.length;
      for (const member of present) {
        pauseSecondsByWorker.set(
          member.workerId,
          (pauseSecondsByWorker.get(member.workerId) ?? 0) + share,
        );
      }
    }
  }

  const raceCountByWorker = new Map<string, Set<string>>();
  for (const award of awards) {
    const set = raceCountByWorker.get(award.workerId) ?? new Set<string>();
    set.add(award.raceId);
    raceCountByWorker.set(award.workerId, set);
  }

  return board.byVolume.map((row) => {
    const worker = workerById.get(row.worker.workerId);
    return {
      worker: row.worker,
      races: raceCountByWorker.get(row.worker.workerId)?.size ?? 0,
      batches: row.batches,
      pallets: row.pallets,
      cartons: row.cartons,
      points: row.points,
      activeSeconds: row.activeSeconds,
      activeHours: row.activeHours,
      pointsPerHour: row.pointsPerHour,
      pauseSeconds: Math.round(pauseSecondsByWorker.get(row.worker.workerId) ?? 0),
      ...(worker ? {} : {}),
    } satisfies WorkerSummaryReportRow;
  });
}

/**
 * Flat pallet ledger including the exact point split per team member.
 *
 * `raceNames` is resolved from the pallet's award rows, because a pallet is
 * attributed to every race that was ACTIVE when it was logged and carries no
 * race id of its own.
 */
export async function getPalletLedger(
  from?: string,
  to?: string,
): Promise<
  Array<{
    pallet: PalletLog;
    batchId: string;
    line: ProductionLine | null;
    productName: string;
    raceNames: string[];
    awards: Array<{ workerId: string; fullName: string; emoji: string; points: number }>;
  }>
> {
  const repository = getRepository();
  const batches = await repository.listBatches({ ...(from ? { from } : {}), ...(to ? { to } : {}), limit: 100000 });
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));
  const batchIds = batches.map((batch) => batch.id);

  const [pallets, awards, workers, products, lines, races] = await Promise.all([
    repository.listPalletLogsForBatches(batchIds),
    repository.listPointAwardsForBatches(batchIds),
    repository.listWorkers(),
    repository.listProducts(),
    repository.listProductionLines(),
    repository.listRaces(),
  ]);

  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const raceById = new Map(races.map((race) => [race.id, race]));
  const awardsByPallet = groupBy(awards, (award) => award.palletLogId);

  return pallets
    .map((pallet) => {
      const batch = batchById.get(pallet.batchId);
      const palletAwards = awardsByPallet.get(pallet.id) ?? [];

      // One award row exists per (worker × race), so de-duplicate the workers and
      // collect the distinct races this pallet was scored in.
      const distinctWorkers = dedupeBy(palletAwards, (award) => award.workerId);
      const raceNames = [...new Set(palletAwards.map((award) => award.raceId))]
        .map((raceId) => raceById.get(raceId)?.name)
        .filter((name): name is string => Boolean(name));

      return {
        pallet,
        batchId: pallet.batchId,
        line: batch ? (lineById.get(batch.lineId) ?? null) : null,
        productName: productById.get(pallet.productId)?.name ?? '—',
        raceNames,
        awards: distinctWorkers.map((award) => {
          const worker = workerById.get(award.workerId);
          return {
            workerId: award.workerId,
            fullName: worker?.fullName ?? '—',
            emoji: worker?.emoji ?? '👤',
            points: award.points,
          };
        }),
      };
    })
    .sort((a, b) => new Date(b.pallet.createdAt).getTime() - new Date(a.pallet.createdAt).getTime());
}

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                             */
/* -------------------------------------------------------------------------- */

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function dedupeBy<T, K>(items: T[], keyOf: (item: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
