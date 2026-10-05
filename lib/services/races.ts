/**
 * Leaderboard race lifecycle.
 *
 * A race is a scoring window. Points are never "deleted" when a race ends: every
 * point award carries its own `raceId`, so a race's standings are simply the sum
 * of the ledger rows stamped with it. Opening a race therefore starts its
 * counters at zero while all history stays queryable per race.
 *
 * **Concurrent scoring.** Several races may be ACTIVE at once, and *every* one of
 * them accumulates points from *every* running batch — there is no race
 * selection when a batch is started, and no re-pointing when a race opens. The
 * fan-out happens in `addPallet`, which writes one award per (worker × race that
 * is ACTIVE at that instant).
 *
 * `isPrimary` is therefore a **display preference only**: it decides which board
 * the station sidebar, the app header, the daily screen and TV Mode surface by
 * default. It has no effect on scoring.
 *
 * Races are closed in two ways:
 *   - explicitly, by a supervisor (`finishRace`);
 *   - automatically, the moment their configured end date passes
 *     (`archiveExpiredRaces`, evaluated on every read).
 */

import type { Race, RaceProductPoint, RaceSummary } from '@/lib/domain/types';
import { getRepository } from '@/lib/repo';
import { Errors } from '@/lib/utils/errors';
import { newId, nowIso } from '@/lib/utils/id';
import { getNumberSetting } from '@/lib/services/settings';
import { SETTING_KEYS } from '@/lib/db/schema';

export interface RaceInput {
  name: string;
  prizeDescription?: string | null;
  startAt?: string;
  endAt?: string | null;
  minActiveHours?: number;
  /** Defaults to true — the new race becomes the default board to display. */
  isPrimary?: boolean;
  /** Explicit per-product point multipliers for the new race. */
  productPoints?: Array<{ productId: string; pointValue: number }>;
}

export interface FinishRaceInput {
  endAt?: string;
  archiveNote?: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Reads                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Lists races, first archiving any whose end date has already passed.
 *
 * The auto-archive check lives on the read path rather than in a scheduled job:
 * it is one indexed query, it is idempotent, and it means a race can never be
 * observed in the wrong state by any screen or API consumer. No cron, no
 * background worker, nothing to keep alive.
 */
export async function listRaces(options?: { status?: Race['status'] }, now = Date.now()): Promise<Race[]> {
  await archiveExpiredRaces(now);
  return getRepository().listRaces(options?.status ? { status: options.status } : undefined);
}

export async function listActiveRaces(now = Date.now()): Promise<Race[]> {
  await archiveExpiredRaces(now);
  return getRepository().listRaces({ status: 'ACTIVE' });
}

export async function getRace(id: string): Promise<Race> {
  await archiveExpiredRaces();
  const race = await getRepository().getRaceById(id);
  if (!race) throw Errors.notFound('race');
  return race;
}

/** The race surfaced by default. A display preference, not a scoring filter. */
export async function getPrimaryRace(now = Date.now()): Promise<Race | null> {
  await archiveExpiredRaces(now);
  return getRepository().getPrimaryRace();
}

export async function getRaceOrPrimary(raceId?: string, now = Date.now()): Promise<Race | null> {
  await archiveExpiredRaces(now);
  const repository = getRepository();
  if (raceId) return repository.getRaceById(raceId);
  return repository.getPrimaryRace();
}

/**
 * Compact per-race totals for the leaderboard race selector.
 *
 * Everything is derived from the ledger's own `raceId`, so a batch that
 * contributed to several races is counted correctly in each of them.
 */
export async function getRaceSummaries(now = Date.now()): Promise<RaceSummary[]> {
  await archiveExpiredRaces(now);

  const repository = getRepository();
  const races = await repository.listRaces();

  const summaries: RaceSummary[] = [];
  for (const race of races) {
    const awards = await repository.listPointAwards({ raceId: race.id });
    const palletIds = [...new Set(awards.map((award) => award.palletLogId))];
    const pallets = await repository.listPalletLogsByIds(palletIds);

    summaries.push({
      race,
      points: Math.round(awards.reduce((sum, award) => sum + award.points, 0) * 100) / 100,
      pallets: pallets.length,
      cartons: pallets.reduce((sum, pallet) => sum + pallet.cartons, 0),
      batches: new Set(awards.map((award) => award.batchId)).size,
      workers: new Set(awards.map((award) => award.workerId)).size,
    });
  }

  return summaries;
}

/* -------------------------------------------------------------------------- */
/*  Race point multipliers                                                    */
/* -------------------------------------------------------------------------- */

export async function listRaceProductPoints(raceId: string): Promise<RaceProductPoint[]> {
  return getRepository().listRaceProductPoints(raceId);
}

/**
 * Replaces the whole per-race point-multiplier set.
 *
 * Idempotent: rows already present are updated in place, new ones inserted, and
 * ones removed from the payload deleted. Historical `pallet_logs.pointValue`
 * snapshots and every existing `point_awards.points` value are untouched, so
 * past pallets keep the multiplier they were logged with.
 */
export async function setRaceProductPoints(
  raceId: string,
  rows: Array<{ productId: string; pointValue: number }>,
): Promise<RaceProductPoint[]> {
  const repository = getRepository();
  await getRace(raceId);

  for (const row of rows) {
    if (!Number.isFinite(row.pointValue) || row.pointValue <= 0) {
      throw Errors.validation('ערך הנקודות לקרטון חייב להיות גדול מ-0.');
    }
  }

  const existing = await repository.listRaceProductPoints(raceId);
  const byProduct = new Map(existing.map((item) => [item.productId, item]));
  const keep = new Set<string>();

  for (const row of rows) {
    const current = byProduct.get(row.productId);
    if (current) {
      keep.add(current.id);
      await repository.updateRaceProductPoint(current.id, { pointValue: row.pointValue });
    } else {
      const inserted = await repository.insertRaceProductPoint({
        id: newId(),
        raceId,
        productId: row.productId,
        pointValue: row.pointValue,
      });
      keep.add(inserted.id);
    }
  }

  for (const item of existing) {
    if (!keep.has(item.id)) {
      await repository.deleteRaceProductPoint(item.id);
    }
  }

  return repository.listRaceProductPoints(raceId);
}

/**
 * The multiplier a race applies to a product: the race override when one exists,
 * otherwise the product's own value.
 */
export async function resolvePointValue(
  raceId: string | null,
  productId: string,
  fallback: number,
): Promise<number> {
  if (!raceId) return fallback;
  const rows = await getRepository().listRaceProductPoints(raceId);
  const override = rows.find((row) => row.productId === productId);
  return override ? override.pointValue : fallback;
}

/** Effective point value per product for a race — used by the admin editor. */
export async function getEffectivePointValues(raceId: string | null): Promise<Record<string, number>> {
  if (!raceId) return {};
  const rows = await getRepository().listRaceProductPoints(raceId);
  return Object.fromEntries(rows.map((row) => [row.productId, row.pointValue]));
}

/* -------------------------------------------------------------------------- */
/*  Primary race maintenance                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Guarantees there is exactly one primary ACTIVE race whenever any race is
 * active. Only the display default moves — scoring is unaffected, because every
 * active race scores from every batch.
 */
async function promotePrimary(raceId: string): Promise<Race | null> {
  await getRepository().setPrimaryRace(raceId);
  return getRepository().getRaceById(raceId);
}

/**
 * After a race is closed, makes sure the floor still has a default board:
 * promotes the newest remaining ACTIVE race, or leaves none.
 */
async function ensurePrimaryAfterArchive(): Promise<Race | null> {
  const repository = getRepository();
  const existingPrimary = await repository.getPrimaryRace();
  if (existingPrimary) return existingPrimary;

  const active = await repository.listRaces({ status: 'ACTIVE' });
  if (active.length === 0) return null;

  return promotePrimary(active[0].id);
}

/* -------------------------------------------------------------------------- */
/*  Auto-archiving                                                            */
/* -------------------------------------------------------------------------- */

export interface AutoArchiveResult {
  archived: Race[];
}

/**
 * Closes every ACTIVE race whose configured end date has passed.
 *
 * Called at the top of every race read, so a race transitions into the archive
 * the first time anything looks at it after its deadline — no scheduler, no
 * missed window, and no chance of a finished race still accepting points (the
 * fan-out in `addPallet` only considers ACTIVE races).
 */
export async function archiveExpiredRaces(now = Date.now()): Promise<AutoArchiveResult> {
  const repository = getRepository();
  const expired = await repository.listExpiredActiveRaces(new Date(now).toISOString());
  if (expired.length === 0) return { archived: [] };

  const archived: Race[] = [];
  for (const race of expired) {
    // Guard against a race that was already closed between the query and now.
    const current = await repository.getRaceById(race.id);
    if (!current || current.status !== 'ACTIVE') continue;

    const closed = await repository.updateRace(race.id, {
      status: 'FINISHED',
      endAt: current.endAt ?? new Date(now).toISOString(),
      isPrimary: false,
      archiveNote: current.archiveNote ?? 'הסתיים אוטומטית בהגיע מועד הסיום',
    });
    archived.push(closed);
  }

  if (archived.length > 0) {
    console.info(`[shift] Auto-archived ${archived.length} race(s) past their end date.`);
    await ensurePrimaryAfterArchive();
  }

  return { archived };
}

/* -------------------------------------------------------------------------- */
/*  Commands                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Opens a new race.
 *
 * Nothing is closed and nothing is re-pointed. A race that is already running
 * simply stops being the display default if the new one takes over; it stays
 * ACTIVE and keeps scoring from every batch, exactly like the new one. Every
 * counter on the new race starts at zero because no award carries its id yet,
 * and the very next pallet logged on any line contributes to it.
 */
export async function startRace(input: RaceInput): Promise<Race> {
  if (!input.name?.trim()) throw Errors.validation('יש להזין שם למרוץ.');

  const repository = getRepository();
  const defaultMinHours = await getNumberSetting(SETTING_KEYS.MIN_RACE_HOURS, 30);
  const startAt = input.startAt ? new Date(input.startAt).toISOString() : nowIso();
  const endAt = input.endAt ? new Date(input.endAt).toISOString() : null;

  if (endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    throw Errors.validation('תאריך הסיום חייב להיות אחרי תאריך ההתחלה.');
  }

  const race: Race = {
    id: newId(),
    name: input.name.trim(),
    prizeDescription: input.prizeDescription?.trim() || null,
    startAt,
    endAt,
    minActiveHours:
      input.minActiveHours !== undefined && Number.isFinite(input.minActiveHours)
        ? Math.max(0, input.minActiveHours)
        : defaultMinHours,
    status: 'ACTIVE',
    // Inserted un-promoted so the partial unique index can never be violated
    // between the insert and the promotion.
    isPrimary: false,
    archiveNote: null,
    createdAt: nowIso(),
  };

  await repository.insertRace(race);

  for (const row of input.productPoints ?? []) {
    if (!Number.isFinite(row.pointValue) || row.pointValue <= 0) {
      throw Errors.validation('ערך הנקודות לקרטון חייב להיות גדול מ-0.');
    }
    await repository.insertRaceProductPoint({
      id: newId(),
      raceId: race.id,
      productId: row.productId,
      pointValue: row.pointValue,
    });
  }

  if (input.isPrimary !== false) {
    await promotePrimary(race.id);
  }

  return getRace(race.id);
}

export async function updateRace(id: string, input: Partial<RaceInput>): Promise<Race> {
  const repository = getRepository();
  const race = await getRace(id);

  const startAt = input.startAt !== undefined ? new Date(input.startAt).toISOString() : race.startAt;
  const endAt =
    input.endAt !== undefined ? (input.endAt ? new Date(input.endAt).toISOString() : null) : race.endAt;

  if (endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    throw Errors.validation('תאריך הסיום חייב להיות אחרי תאריך ההתחלה.');
  }

  const updated = await repository.updateRace(id, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.prizeDescription !== undefined
      ? { prizeDescription: input.prizeDescription?.trim() || null }
      : {}),
    ...(input.startAt !== undefined ? { startAt } : {}),
    ...(input.endAt !== undefined ? { endAt } : {}),
    ...(input.minActiveHours !== undefined ? { minActiveHours: Math.max(0, input.minActiveHours) } : {}),
  });

  if (input.productPoints) {
    await setRaceProductPoints(id, input.productPoints);
  }

  // An edited end date in the past must take effect immediately.
  await archiveExpiredRaces();

  return updated;
}

/** Makes a race the default board to display. Scoring is unaffected. */
export async function setPrimaryRace(id: string): Promise<{ race: Race }> {
  const repository = getRepository();
  const race = await repository.getRaceById(id);
  if (!race) throw Errors.notFound('race');
  if (race.status !== 'ACTIVE') throw Errors.raceAlreadyFinished();

  await promotePrimary(id);
  return { race: await getRace(id) };
}

/** Reopens a finished race and makes it the default board again. */
export async function reopenRace(id: string): Promise<Race> {
  const repository = getRepository();
  const race = await getRace(id);

  await repository.updateRace(race.id, { status: 'ACTIVE', endAt: null, isPrimary: false });
  await promotePrimary(race.id);

  return getRace(race.id);
}

/**
 * Closes a race and moves it to the archive.
 *
 * Nothing is deleted: the race keeps its ledger rows and its standings stay
 * viewable under the archive filter forever. If it was the primary race, the
 * newest remaining active race is promoted so the default board keeps working.
 */
export async function finishRace(raceId: string, input: FinishRaceInput = {}): Promise<Race> {
  const repository = getRepository();
  const race = await getRace(raceId);

  if (race.status !== 'ACTIVE') throw Errors.raceAlreadyFinished();

  const closedAt = input.endAt ? new Date(input.endAt).toISOString() : nowIso();
  const archived = await repository.updateRace(race.id, {
    status: 'FINISHED',
    endAt: closedAt,
    isPrimary: false,
    archiveNote: input.archiveNote?.trim() || null,
  });

  await ensurePrimaryAfterArchive();

  return archived;
}

/**
 * Deletes a race permanently, together with its own ledger rows.
 *
 * This is the destructive counterpart to archiving, and it is deliberately
 * explicit: `point_awards.race_id` cascades, so every point ever scored in this
 * race is destroyed. No other race, batch or pallet is affected, because race
 * attribution lives only in the award rows. The caller is expected to have
 * confirmed the loss with the operator.
 */
export async function deleteRace(raceId: string): Promise<{ deleted: Race; removedAwards: number }> {
  const repository = getRepository();
  const race = await getRace(raceId);

  const awards = await repository.listPointAwards({ raceId: race.id });

  await repository.deleteRace(race.id);

  // If the deleted race was the default board, promote a replacement.
  if (race.isPrimary) {
    await ensurePrimaryAfterArchive();
  }

  return { deleted: race, removedAwards: awards.length };
}

/** How much ledger data a race holds — shown before a destructive delete. */
export async function getRaceImpact(raceId: string): Promise<{
  awards: number;
  pallets: number;
  workers: number;
  batches: number;
  points: number;
}> {
  const repository = getRepository();
  const awards = await repository.listPointAwards({ raceId });

  return {
    awards: awards.length,
    pallets: new Set(awards.map((award) => award.palletLogId)).size,
    workers: new Set(awards.map((award) => award.workerId)).size,
    batches: new Set(awards.map((award) => award.batchId)).size,
    points: Math.round(awards.reduce((sum, award) => sum + award.points, 0) * 100) / 100,
  };
}

/**
 * Ensures the floor has a default board at boot. If races exist but none is
 * primary, the newest ACTIVE one is promoted.
 */
export async function ensurePrimaryRace(): Promise<Race | null> {
  await archiveExpiredRaces();

  const repository = getRepository();
  const existing = await repository.getPrimaryRace();
  if (existing) return existing;

  const active = await repository.listRaces({ status: 'ACTIVE' });
  if (active.length === 0) return null;

  return promotePrimary(active[0].id);
}
