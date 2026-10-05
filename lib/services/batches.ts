/**
 * Batch (shift) lifecycle — the operational heart of the platform.
 *
 * Invariants enforced here:
 *   - At most one ACTIVE batch per line.
 *   - A batch always has at least one member; a pallet can never be logged
 *     onto an empty team.
 *   - A batch can never have two simultaneously open pauses.
 *   - Points are split *only* across members whose membership interval covers
 *     the exact instant the pallet is logged. Removing a worker mid-batch
 *     therefore never retroactively changes points already awarded, and all
 *     subsequent pallets go solely to whoever is left.
 *
 * **Concurrent-race scoring.** A batch is not tied to a race. When a pallet is
 * logged it is attributed to *every* race that is ACTIVE at that instant, and one
 * point award is written per (worker × active race) pair. A three-person crew
 * with two open races therefore produces six award rows for one pallet.
 *
 * Consequences, all of them intentional:
 *   - Opening a new race needs no batch restart and no destructive write: the
 *     next pallet logged on any line contributes to it automatically, and its
 *     counters start at zero because no award carries its id yet.
 *   - Each race applies *its own* point multiplier, so the same pallet can be
 *     worth different amounts in different races.
 *   - `pallet.totalPoints` is the pallet's value at the product's **base**
 *     multiplier. It is what the batch and daily totals are built from, so
 *     editing a race multiplier never shifts historical production figures.
 */

import type {
  Batch,
  BatchMember,
  BatchStats,
  BatchView,
  PalletLog,
  PalletSize,
  PauseLog,
  PointAward,
  PauseReasonCode,
  Product,
  ProductionLine,
  Race,
  StationView,
} from '@/lib/domain/types';
import { activeMembersAt, buildBatchView, computeBatchStats, totalPauseSeconds } from '@/lib/domain/batch';
import { computePalletPoints, roundPoints, splitPoints } from '@/lib/domain/points';
import { getRepository } from '@/lib/repo';
import { Errors } from '@/lib/utils/errors';
import { newId, nowIso } from '@/lib/utils/id';
import { pauseReasonLabel } from '@/lib/i18n/he';
import { listActiveRaces, resolvePointValue } from '@/lib/services/races';

/* -------------------------------------------------------------------------- */
/*  Reads                                                                     */
/* -------------------------------------------------------------------------- */

export async function listActiveBatches(): Promise<Batch[]> {
  return getRepository().listActiveBatches();
}

export async function getBatchOrThrow(batchId: string): Promise<Batch> {
  const batch = await getRepository().getBatchById(batchId);
  if (!batch) throw Errors.notFound('batch');
  return batch;
}

/** Assembles the full dashboard view model for a single batch. */
export async function getBatchView(batchId: string, now = Date.now()): Promise<BatchView> {
  const repository = getRepository();
  const batch = await getBatchOrThrow(batchId);

  const [product, line, activeRaces] = await Promise.all([
    repository.getProductById(batch.productId),
    repository.getProductionLineById(batch.lineId),
    listActiveRaces(),
  ]);
  if (!product) throw Errors.notFound('product');

  const [members, pauses, pallets, awards, palletSizes, workers] = await Promise.all([
    repository.listBatchMembers(batch.id),
    repository.listPauseLogsByBatch(batch.id),
    repository.listPalletLogsByBatch(batch.id),
    repository.listPointAwardsByBatch(batch.id),
    repository.listPalletSizesByProduct(batch.productId),
    repository.listWorkers(),
  ]);

  const fallbackLine: ProductionLine = line ?? {
    id: batch.lineId,
    name: '—',
    code: '?',
    sortOrder: 0,
    isActive: false,
    createdAt: batch.createdAt,
  };

  // Points shown per member are the pallet's base-value shares, de-duplicated
  // across races: the same worker earns the same base share in every race, so
  // summing raw awards would multiply their figure by the number of open races.
  const baseAwardsByWorker = new Map<string, number>();
  const seenPalletWorkers = new Set<string>();
  for (const award of awards) {
    const key = `${award.palletLogId}:${award.workerId}`;
    if (seenPalletWorkers.has(key)) continue;
    seenPalletWorkers.add(key);
    baseAwardsByWorker.set(award.workerId, (baseAwardsByWorker.get(award.workerId) ?? 0) + award.points);
  }

  return buildBatchView({
    batch,
    line: fallbackLine,
    product,
    activeRaceNames: activeRaces.map((race) => race.name),
    members,
    pauses,
    pallets,
    palletSizes,
    workers,
    awards: [...baseAwardsByWorker].map(([workerId, points]) => ({ workerId, points })),
    now,
  });
}

/**
 * Every active line, in the supervisor's configured order, paired with whatever
 * it is currently running. This is the primary dashboard payload and scales to
 * any number of configured lines.
 */
export async function getStationViews(now = Date.now()): Promise<StationView[]> {
  const repository = getRepository();
  const [lines, active] = await Promise.all([
    repository.listProductionLines(),
    repository.listActiveBatches(),
  ]);

  const byLine = new Map(active.map((batch) => [batch.lineId, batch]));

  const stations: StationView[] = [];
  for (const line of lines) {
    if (!line.isActive) continue;
    const batch = byLine.get(line.id);
    stations.push({
      line,
      batch: batch ? await getBatchView(batch.id, now) : null,
    });
  }

  return stations;
}

export interface PalletPreviewRace {
  raceId: string;
  raceName: string;
  pointValue: number;
  totalPoints: number;
  perMember: number;
}

/**
 * Point preview for the pallet dialog, before anything is written.
 *
 * Returns the base figures plus a per-race breakdown, so the operator can see
 * exactly what the pallet will be worth in each open race.
 */
export async function previewPalletPoints(
  productId: string,
  cartons: number,
  batchId?: string,
): Promise<{
  cartons: number;
  pointValue: number;
  totalPoints: number;
  memberCount: number;
  perMember: number;
  races: PalletPreviewRace[];
}> {
  const repository = getRepository();
  const product = await repository.getProductById(productId);
  if (!product) throw Errors.notFound('product');
  if (!Number.isFinite(cartons) || cartons <= 0 || !Number.isInteger(cartons)) throw Errors.invalidCartons();

  const activeRaces = await listActiveRaces();

  let memberCount = 0;
  if (batchId) {
    const members = await repository.listBatchMembers(batchId);
    memberCount = activeMembersAt(members, Date.now()).length;
  }

  const totalPoints = computePalletPoints(cartons, product.pointValue);
  const baseSplit =
    memberCount > 0 ? splitPoints(cartons, product.pointValue, Array(memberCount).fill('x')) : null;

  const races: PalletPreviewRace[] = [];
  for (const race of activeRaces) {
    const pointValue = await resolvePointValue(race.id, productId, product.pointValue);
    const raceTotal = computePalletPoints(cartons, pointValue);
    const raceSplit =
      memberCount > 0 ? splitPoints(cartons, pointValue, Array(memberCount).fill('x')) : null;
    races.push({
      raceId: race.id,
      raceName: race.name,
      pointValue,
      totalPoints: raceTotal,
      perMember: raceSplit?.shares[0] ?? 0,
    });
  }

  return {
    cartons,
    pointValue: product.pointValue,
    totalPoints,
    memberCount,
    perMember: baseSplit?.shares[0] ?? 0,
    races,
  };
}

/* -------------------------------------------------------------------------- */
/*  Commands                                                                  */
/* -------------------------------------------------------------------------- */

export interface StartBatchInput {
  lineId: string;
  productId: string;
  memberIds: string[];
  notes?: string | null;
}

/**
 * Opens a batch.
 *
 * There is no race to choose: the batch automatically contributes to whichever
 * races are ACTIVE at each moment a pallet is logged. Starting is deliberately
 * *not* blocked when no race is open — production tracking is valuable on its
 * own, and the UI surfaces a warning instead.
 */
export async function startBatch(input: StartBatchInput): Promise<BatchView> {
  const repository = getRepository();

  if (!input.lineId) throw Errors.validation('יש לבחור קו ייצור.');
  if (!input.productId) throw Errors.validation('יש לבחור מוצר לאצווה.');

  const memberIds = [...new Set(input.memberIds.filter(Boolean))];
  if (memberIds.length === 0) throw Errors.validation('יש לבחור לפחות עובד אחד לצוות.');

  const [product, line, busy, workers] = await Promise.all([
    repository.getProductById(input.productId),
    repository.getProductionLineById(input.lineId),
    repository.getActiveBatchByLine(input.lineId),
    repository.listWorkers(),
  ]);

  if (!product) throw Errors.notFound('product');
  if (!line) throw Errors.notFound('production_line');
  if (!line.isActive) throw Errors.validation('הקו שנבחר אינו פעיל.');
  if (busy) throw Errors.lineBusy();

  const workerIds = new Set(workers.map((worker) => worker.id));
  const unknown = memberIds.filter((id) => !workerIds.has(id));
  if (unknown.length > 0) {
    throw Errors.validation('אחד או יותר מהעובדים שנבחרו אינם קיימים.');
  }

  const startedAt = nowIso();
  const batch: Batch = {
    id: newId(),
    lineId: line.id,
    productId: product.id,
    startedAt,
    finishedAt: null,
    totalElapsedSeconds: null,
    activeSeconds: null,
    pausedSeconds: null,
    totalCartons: null,
    totalPoints: null,
    status: 'ACTIVE',
    notes: input.notes?.trim() || null,
    createdAt: startedAt,
  };

  await repository.insertBatch(batch);

  for (const workerId of memberIds) {
    await repository.insertBatchMember({
      id: newId(),
      batchId: batch.id,
      workerId,
      joinedAt: startedAt,
      leftAt: null,
    });
  }

  return getBatchView(batch.id);
}

export interface PauseBatchInput {
  reasonCode: PauseReasonCode;
  note?: string | null;
}

export async function pauseBatch(batchId: string, input: PauseBatchInput): Promise<BatchView> {
  const repository = getRepository();
  const batch = await getBatchOrThrow(batchId);

  if (batch.status !== 'ACTIVE') throw Errors.batchNotActive();

  const open = await repository.getOpenPause(batch.id);
  if (open) throw Errors.batchAlreadyPaused();

  await repository.insertPauseLog({
    id: newId(),
    batchId: batch.id,
    reasonCode: input.reasonCode,
    reasonLabel: input.note?.trim() ? input.note.trim() : pauseReasonLabel(input.reasonCode),
    startedAt: nowIso(),
    endedAt: null,
    durationSeconds: null,
  });

  return getBatchView(batch.id);
}

export async function resumeBatch(batchId: string): Promise<BatchView> {
  const repository = getRepository();
  const batch = await getBatchOrThrow(batchId);

  if (batch.status !== 'ACTIVE') throw Errors.batchNotActive();

  const open = await repository.getOpenPause(batch.id);
  if (!open) throw Errors.batchNotPaused();

  const endedAt = nowIso();
  const durationSeconds = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(open.startedAt).getTime()) / 1000),
  );

  await repository.updatePauseLog(open.id, { endedAt, durationSeconds });

  return getBatchView(batch.id);
}

export interface AddPalletInput {
  /** Predefined pallet size chosen from the grid. */
  palletSizeId?: string | null;
  /** Custom carton count, used when no predefined size is selected. */
  cartons?: number | null;
  note?: string | null;
}

/** What one pallet contributed to one race. */
export interface PalletRaceAttribution {
  raceId: string;
  raceName: string;
  /** The multiplier this race applied to the product. */
  pointValue: number;
  totalPoints: number;
  perMemberPoints: number[];
}

export interface AddPalletResult {
  pallet: PalletLog;
  /** Every ledger row written — one per (worker × active race). */
  awards: PointAward[];
  memberIds: string[];
  /** The pallet's value at the product's base multiplier. */
  totalPoints: number;
  perMemberPoints: number[];
  /** Per-race breakdown, in the order the races are listed. */
  races: PalletRaceAttribution[];
  view: BatchView;
}

/**
 * Logs a pallet and immediately attributes its points to **every active race**.
 *
 * The pallet and every resulting award are written in one atomic operation, so
 * the ledger can never be left half-written.
 *
 * A race that is not ACTIVE at this instant receives nothing — which is exactly
 * why opening a new race takes effect on the very next pallet without any batch
 * being restarted, and why an archived race stops accumulating immediately.
 */
export async function addPallet(batchId: string, input: AddPalletInput): Promise<AddPalletResult> {
  const repository = getRepository();
  const batch = await getBatchOrThrow(batchId);

  if (batch.status !== 'ACTIVE') throw Errors.batchNotActive();

  const [product, members, palletSizes, activeRaces] = await Promise.all([
    repository.getProductById(batch.productId),
    repository.listBatchMembers(batch.id),
    repository.listPalletSizesByProduct(batch.productId),
    listActiveRaces(),
  ]);
  if (!product) throw Errors.notFound('product');

  // --- Carton count --------------------------------------------------------
  let cartons: number;
  let palletSizeId: string | null = null;

  if (input.cartons !== null && input.cartons !== undefined) {
    if (!Number.isFinite(input.cartons) || input.cartons <= 0 || !Number.isInteger(input.cartons)) {
      throw Errors.invalidCartons();
    }
    cartons = input.cartons;
    palletSizeId =
      input.palletSizeId && palletSizes.some((size) => size.id === input.palletSizeId)
        ? input.palletSizeId
        : null;
  } else if (input.palletSizeId) {
    const size: PalletSize | undefined = palletSizes.find((candidate) => candidate.id === input.palletSizeId);
    if (!size) throw Errors.notFound('pallet_size');
    cartons = size.cartons;
    palletSizeId = size.id;
  } else {
    throw Errors.invalidCartons();
  }

  const at = Date.now();
  const recipients = activeMembersAt(members, at);
  if (recipients.length === 0) throw Errors.teamEmpty();

  const timestamp = new Date(at).toISOString();

  // --- The pallet itself, valued at the product's base multiplier ----------
  const basePointValue = product.pointValue;
  const baseSplit = splitPoints(cartons, basePointValue, recipients);

  const pallet: PalletLog = {
    id: newId(),
    batchId: batch.id,
    productId: product.id,
    palletSizeId,
    cartons,
    pointValue: basePointValue,
    totalPoints: baseSplit.totalPoints,
    note: input.note?.trim() || null,
    createdAt: timestamp,
  };

  // --- Fan out across every ACTIVE race -----------------------------------
  const awards: PointAward[] = [];
  const races: PalletRaceAttribution[] = [];

  for (const race of activeRaces) {
    // Each race applies its own multiplier override when it has one.
    const pointValue = await resolvePointValue(race.id, product.id, basePointValue);
    const split = splitPoints(cartons, pointValue, recipients);

    for (const award of split.awards) {
      awards.push({
        id: newId(),
        batchId: batch.id,
        palletLogId: pallet.id,
        raceId: race.id,
        workerId: award.workerId,
        points: award.points,
        createdAt: timestamp,
      });
    }

    races.push({
      raceId: race.id,
      raceName: race.name,
      pointValue,
      totalPoints: split.totalPoints,
      perMemberPoints: split.shares,
    });
  }

  await repository.insertPalletWithAwards({ pallet, awards });

  return {
    pallet,
    awards,
    memberIds: recipients,
    totalPoints: baseSplit.totalPoints,
    perMemberPoints: baseSplit.shares,
    races,
    view: await getBatchView(batch.id),
  };
}

/**
 * Undo the most recent pallet of a batch (mis-tap recovery).
 *
 * The pallet and its point awards are removed together, so the ledger stays
 * balanced: `sum(point_awards) === sum(pallet_logs.total_points)`.
 */
export async function removeLastPallet(batchId: string): Promise<BatchView> {
  const repository = getRepository();
  const batch = await getBatchOrThrow(batchId);
  if (batch.status !== 'ACTIVE') throw Errors.batchNotActive();

  const pallets = await repository.listPalletLogsByBatch(batch.id);
  if (pallets.length === 0) return getBatchView(batch.id);

  const last = pallets.reduce((latest, pallet) =>
    new Date(pallet.createdAt).getTime() > new Date(latest.createdAt).getTime() ? pallet : latest,
  );

  await repository.deletePalletLog(last.id);

  return getBatchView(batch.id);
}

/* -------------------------------------------------------------------------- */
/*  Mid-batch team modification                                               */
/* -------------------------------------------------------------------------- */

export async function addBatchMember(batchId: string, workerId: string): Promise<BatchView> {
  const repository = getRepository();
  const batch = await getBatchOrThrow(batchId);
  if (batch.status !== 'ACTIVE') throw Errors.batchNotActive();

  const [members, worker] = await Promise.all([
    repository.listBatchMembers(batch.id),
    repository.getWorkerById(workerId),
  ]);
  if (!worker) throw Errors.notFound('worker');

  const alreadyActive = members.some((member) => member.workerId === workerId && member.leftAt === null);
  if (alreadyActive) throw Errors.workerAlreadyOnBatch();

  await repository.insertBatchMember({
    id: newId(),
    batchId: batch.id,
    workerId,
    joinedAt: nowIso(),
    leftAt: null,
  });

  return getBatchView(batch.id);
}

/**
 * Removes a worker from a running batch.
 *
 * Points already awarded are untouched — the membership interval is simply
 * closed, so every pallet logged from now on is split among the remaining
 * members only.
 */
export async function removeBatchMember(batchId: string, workerId: string): Promise<BatchView> {
  const repository = getRepository();
  const batch = await getBatchOrThrow(batchId);
  if (batch.status !== 'ACTIVE') throw Errors.batchNotActive();

  const members = await repository.listBatchMembers(batch.id);
  const active = members.filter((member) => member.leftAt === null);
  const target = active.find((member) => member.workerId === workerId);

  if (!target) throw Errors.notFound('batch_member');
  if (active.length <= 1) throw Errors.teamEmpty();

  await repository.updateBatchMember(target.id, { leftAt: nowIso() });

  return getBatchView(batch.id);
}

/* -------------------------------------------------------------------------- */
/*  Finish / cancel                                                           */
/* -------------------------------------------------------------------------- */

export interface FinishBatchResult {
  batch: Batch;
  stats: BatchStats;
  pauses: PauseLog[];
  members: BatchMember[];
  pallets: PalletLog[];
}

/**
 * Closes a batch, writing an immutable snapshot of its totals.
 *
 * An open pause is closed first so the snapshot is internally consistent.
 */
export async function finishBatch(
  batchId: string,
  options?: { notes?: string | null },
): Promise<FinishBatchResult> {
  const repository = getRepository();
  const batch = await getBatchOrThrow(batchId);

  if (batch.status !== 'ACTIVE') throw Errors.batchNotActive();

  const now = Date.now();

  const open = await repository.getOpenPause(batch.id);
  if (open) {
    const endedAt = new Date(now).toISOString();
    await repository.updatePauseLog(open.id, {
      endedAt,
      durationSeconds: Math.max(0, Math.round((now - new Date(open.startedAt).getTime()) / 1000)),
    });
  }

  const [pauses, pallets, members] = await Promise.all([
    repository.listPauseLogsByBatch(batch.id),
    repository.listPalletLogsByBatch(batch.id),
    repository.listBatchMembers(batch.id),
  ]);

  const stats = computeBatchStats({ ...batch, finishedAt: new Date(now).toISOString() }, pauses, pallets, now);

  const updated = await repository.updateBatch(batch.id, {
    status: 'COMPLETED',
    finishedAt: new Date(now).toISOString(),
    totalElapsedSeconds: stats.elapsedSeconds,
    activeSeconds: stats.activeSeconds,
    pausedSeconds: stats.pausedSeconds,
    totalCartons: stats.totalCartons,
    totalPoints: roundPoints(stats.totalPoints),
    ...(options?.notes !== undefined
      ? { notes: options.notes?.trim() ? options.notes.trim() : batch.notes }
      : {}),
  });

  return { batch: updated, stats, pauses, members, pallets };
}

/** Discards a running batch and everything attached to it. */
export async function cancelBatch(batchId: string): Promise<void> {
  const repository = getRepository();
  const batch = await getBatchOrThrow(batchId);
  await repository.deleteBatch(batch.id);
}

/* -------------------------------------------------------------------------- */
/*  Aggregates used by the dashboard header                                   */
/* -------------------------------------------------------------------------- */

export interface DayTotals {
  points: number;
  cartons: number;
  pallets: number;
  batchesCompleted: number;
  activeSeconds: number;
  pausedSeconds: number;
}

/** Totals for every batch that *started* today (local time). */
export async function getDayTotals(dayStart: Date, dayEnd: Date): Promise<DayTotals> {
  const repository = getRepository();
  const batches = await repository.listBatches({
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
  });

  const batchIds = batches.map((batch) => batch.id);
  const [pallets, pauses] = await Promise.all([
    repository.listPalletLogsForBatches(batchIds),
    repository.listPauseLogsForBatches(batchIds),
  ]);

  const now = Date.now();
  let activeSeconds = 0;
  for (const batch of batches) {
    const batchPauses = pauses.filter((pause) => pause.batchId === batch.id);
    const batchPallets = pallets.filter((pallet) => pallet.batchId === batch.id);
    activeSeconds += computeBatchStats(batch, batchPauses, batchPallets, now).activeSeconds;
  }

  return {
    points: roundPoints(pallets.reduce((sum, pallet) => sum + pallet.totalPoints, 0)),
    cartons: pallets.reduce((sum, pallet) => sum + pallet.cartons, 0),
    pallets: pallets.length,
    batchesCompleted: batches.filter((batch) => batch.status === 'COMPLETED').length,
    activeSeconds,
    pausedSeconds: pauses.reduce(
      (sum, pause) =>
        sum +
        (pause.durationSeconds ??
          (pause.endedAt ? 0 : Math.max(0, Math.round((now - new Date(pause.startedAt).getTime()) / 1000)))),
      0,
    ),
  };
}

/** Re-exported so API routes do not import from two places. */
export { totalPauseSeconds };
export type { Product };
