/**
 * Live statistics for a single batch.
 *
 * The dashboard timer, the pallet counter and the efficiency metric are all
 * derived here so the server and the client can never disagree: the server is
 * the authority (see `GET /api/state`), and the client simply ticks forward from
 * the last server snapshot.
 */

import type {
  Batch,
  BatchStats,
  BatchView,
  BatchMemberView,
  PalletLog,
  PalletSize,
  PauseLog,
  PauseLogView,
  Product,
  ProductionLine,
  Worker,
} from '@/lib/domain/types';
import { batchWindow, ms, totalSeconds } from '@/lib/domain/intervals';
import { pointsPerHour, roundPoints, sumPoints } from '@/lib/domain/points';

export function toPauseView(pause: PauseLog, now = Date.now()): PauseLogView {
  const isRunning = pause.endedAt === null;
  const durationSeconds = isRunning
    ? Math.max(0, Math.round((now - ms(pause.startedAt)) / 1000))
    : (pause.durationSeconds ??
      Math.max(0, Math.round((ms(pause.endedAt!) - ms(pause.startedAt)) / 1000)));

  return {
    id: pause.id,
    reasonCode: pause.reasonCode,
    reasonLabel: pause.reasonLabel,
    startedAt: pause.startedAt,
    endedAt: pause.endedAt,
    durationSeconds,
    isRunning,
  };
}

export function computeBatchStats(
  batch: Batch,
  pauses: PauseLog[],
  pallets: PalletLog[],
  now = Date.now(),
): BatchStats {
  const window = batchWindow(batch.startedAt, batch.finishedAt, now);
  const elapsedSeconds = Math.max(0, Math.round((window.end - window.start) / 1000));

  const pauseViews = pauses.map((pause) => toPauseView(pause, now));
  const activePause = pauseViews.find((pause) => pause.isRunning) ?? null;
  const pausedSeconds = pauseViews.reduce((sum, pause) => sum + pause.durationSeconds, 0);
  const activeSeconds = Math.max(0, elapsedSeconds - pausedSeconds);

  const totalCartons = pallets.reduce((sum, pallet) => sum + pallet.cartons, 0);
  const totalPoints = sumPoints(pallets.map((pallet) => pallet.totalPoints));

  return {
    elapsedSeconds,
    pausedSeconds,
    activeSeconds,
    isPaused: activePause !== null,
    activePause,
    palletCount: pallets.length,
    totalCartons,
    totalPoints: roundPoints(totalPoints),
    pointsPerHour: pointsPerHour(totalPoints, activeSeconds),
  };
}

export function buildMemberViews(
  members: Array<{ id: string; workerId: string; joinedAt: string; leftAt: string | null }>,
  workersById: Map<string, Worker>,
  awards: Array<{ workerId: string; points: number }>,
  now = Date.now(),
): BatchMemberView[] {
  const pointsByWorker = new Map<string, number>();
  for (const award of awards) {
    pointsByWorker.set(award.workerId, (pointsByWorker.get(award.workerId) ?? 0) + award.points);
  }

  return members
    .map((member) => {
      const worker = workersById.get(member.workerId);
      const isCurrentlyActive = member.leftAt === null || ms(member.leftAt) > now;
      return {
        memberId: member.id,
        workerId: member.workerId,
        fullName: worker?.fullName ?? '—',
        employeeId: worker?.employeeId ?? '—',
        emoji: worker?.emoji ?? '👤',
        joinedAt: member.joinedAt,
        leftAt: member.leftAt,
        isCurrentlyActive,
        points: roundPoints(pointsByWorker.get(member.workerId) ?? 0),
      } satisfies BatchMemberView;
    })
    .sort((a, b) => ms(a.joinedAt) - ms(b.joinedAt));
}

/**
 * Members whose membership interval covers `at` — the exact set that receives
 * the points for a pallet logged at that instant.
 */
export function activeMembersAt(
  members: Array<{ workerId: string; joinedAt: string; leftAt: string | null }>,
  at: number = Date.now(),
): string[] {
  return members
    .filter((member) => ms(member.joinedAt) <= at && (member.leftAt === null || ms(member.leftAt) > at))
    .sort((a, b) => ms(a.joinedAt) - ms(b.joinedAt))
    .map((member) => member.workerId);
}

export function buildBatchView(params: {
  batch: Batch;
  line: ProductionLine;
  product: Product;
  /** Names of every currently ACTIVE race — the batch feeds all of them. */
  activeRaceNames: string[];
  members: Array<{ id: string; workerId: string; joinedAt: string; leftAt: string | null }>;
  pauses: PauseLog[];
  pallets: PalletLog[];
  palletSizes: PalletSize[];
  workers: Worker[];
  awards: Array<{ workerId: string; points: number }>;
  now?: number;
}): BatchView {
  const now = params.now ?? Date.now();
  const workersById = new Map(params.workers.map((worker) => [worker.id, worker]));
  const stats = computeBatchStats(params.batch, params.pauses, params.pallets, now);

  return {
    batch: params.batch,
    line: params.line,
    product: params.product,
    activeRaceNames: params.activeRaceNames,
    stats,
    members: buildMemberViews(params.members, workersById, params.awards, now),
    pauses: params.pauses
      .map((pause) => toPauseView(pause, now))
      .sort((a, b) => ms(b.startedAt) - ms(a.startedAt)),
    palletSizes: params.palletSizes,
    recentPallets: [...params.pallets].sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 8),
  };
}

/** Pause totals grouped by reason, used by history rows and the downtime report. */
export function buildPauseBreakdown(
  pauses: PauseLog[],
  now = Date.now(),
): Array<{
  reasonCode: PauseLog['reasonCode'];
  reasonLabel: string | null;
  occurrences: number;
  totalSeconds: number;
  share: number;
}> {
  const buckets = new Map<
    string,
    {
      reasonCode: PauseLog['reasonCode'];
      reasonLabel: string | null;
      occurrences: number;
      totalSeconds: number;
    }
  >();

  for (const pause of pauses) {
    const view = toPauseView(pause, now);
    const key = pause.reasonCode;
    const bucket = buckets.get(key) ?? {
      reasonCode: pause.reasonCode,
      reasonLabel: pause.reasonLabel,
      occurrences: 0,
      totalSeconds: 0,
    };
    bucket.occurrences += 1;
    bucket.totalSeconds += view.durationSeconds;
    buckets.set(key, bucket);
  }

  const grandTotal = [...buckets.values()].reduce((sum, bucket) => sum + bucket.totalSeconds, 0);

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      share: grandTotal > 0 ? bucket.totalSeconds / grandTotal : 0,
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

/** Total pause seconds of a batch, including an open pause. */
export function totalPauseSeconds(pauses: PauseLog[], now = Date.now()): number {
  return pauses.reduce((sum, pause) => sum + toPauseView(pause, now).durationSeconds, 0);
}

/** Batch elapsed seconds, including a running batch. */
export function elapsedSecondsOf(batch: Batch, now = Date.now()): number {
  return totalSeconds([batchWindow(batch.startedAt, batch.finishedAt, now)]);
}
