/**
 * DrizzleRepository — production persistence adapter.
 *
 * Talks to Neon PostgreSQL through `drizzle-orm/neon-http`. All timestamps are
 * converted to ISO-8601 strings at the boundary so the rest of the application
 * never sees a `Date` object coming out of the database.
 */

import { and, asc, desc, eq, gte, inArray, lt, lte, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { getDb } from '@/lib/db';
import {
  appSettings,
  batchMembers,
  batches,
  palletLogs,
  palletSizes,
  pauseLogs,
  pointAwards,
  productionLines,
  products,
  raceProductPoints,
  races,
  workers,
} from '@/lib/db/schema';
import type {
  AppSetting,
  Batch,
  BatchMember,
  PalletLog,
  PalletSize,
  PauseLog,
  PointAward,
  Product,
  ProductionLine,
  Race,
  RaceProductPoint,
  Worker,
} from '@/lib/domain/types';
import type {
  BatchFilter,
  PalletLogFilter,
  PalletWithAwards,
  PointAwardFilter,
  RaceFilter,
  Repository,
} from '@/lib/repo/types';
import { RepositoryError } from '@/lib/repo/types';

/* -------------------------------------------------------------------------- */
/*  Row -> domain mappers                                                     */
/* -------------------------------------------------------------------------- */

type WorkerRow = typeof workers.$inferSelect;
type LineRow = typeof productionLines.$inferSelect;
type ProductRow = typeof products.$inferSelect;
type PalletSizeRow = typeof palletSizes.$inferSelect;
type RaceRow = typeof races.$inferSelect;
type RaceProductPointRow = typeof raceProductPoints.$inferSelect;
type BatchRow = typeof batches.$inferSelect;
type BatchMemberRow = typeof batchMembers.$inferSelect;
type PalletLogRow = typeof palletLogs.$inferSelect;
type PointAwardRow = typeof pointAwards.$inferSelect;
type PauseLogRow = typeof pauseLogs.$inferSelect;
type AppSettingRow = typeof appSettings.$inferSelect;

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toWorker(row: WorkerRow): Worker {
  return {
    id: row.id,
    fullName: row.fullName,
    employeeId: row.employeeId,
    emoji: row.emoji,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

function toProductionLine(row: LineRow): ProductionLine {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    sizeLabel: row.sizeLabel,
    cartonsPerLayout: row.cartonsPerLayout,
    pointValue: row.pointValue,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPalletSize(row: PalletSizeRow): PalletSize {
  return {
    id: row.id,
    productId: row.productId,
    label: row.label,
    cartons: row.cartons,
    sortOrder: row.sortOrder,
  };
}

function toRace(row: RaceRow): Race {
  return {
    id: row.id,
    name: row.name,
    prizeDescription: row.prizeDescription,
    startAt: row.startAt.toISOString(),
    endAt: iso(row.endAt),
    minActiveHours: row.minActiveHours,
    status: row.status,
    isPrimary: row.isPrimary,
    archiveNote: row.archiveNote,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRaceProductPoint(row: RaceProductPointRow): RaceProductPoint {
  return {
    id: row.id,
    raceId: row.raceId,
    productId: row.productId,
    pointValue: row.pointValue,
  };
}

function toBatch(row: BatchRow): Batch {
  return {
    id: row.id,
    lineId: row.lineId,
    productId: row.productId,
    startedAt: row.startedAt.toISOString(),
    finishedAt: iso(row.finishedAt),
    totalElapsedSeconds: row.totalElapsedSeconds,
    activeSeconds: row.activeSeconds,
    pausedSeconds: row.pausedSeconds,
    totalCartons: row.totalCartons,
    totalPoints: row.totalPoints,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toBatchMember(row: BatchMemberRow): BatchMember {
  return {
    id: row.id,
    batchId: row.batchId,
    workerId: row.workerId,
    joinedAt: row.joinedAt.toISOString(),
    leftAt: iso(row.leftAt),
  };
}

function toPalletLog(row: PalletLogRow): PalletLog {
  return {
    id: row.id,
    batchId: row.batchId,
    productId: row.productId,
    palletSizeId: row.palletSizeId,
    cartons: row.cartons,
    pointValue: row.pointValue,
    totalPoints: row.totalPoints,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPointAward(row: PointAwardRow): PointAward {
  return {
    id: row.id,
    batchId: row.batchId,
    palletLogId: row.palletLogId,
    raceId: row.raceId,
    workerId: row.workerId,
    points: row.points,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPauseLog(row: PauseLogRow): PauseLog {
  return {
    id: row.id,
    batchId: row.batchId,
    reasonCode: row.reasonCode,
    reasonLabel: row.reasonLabel,
    startedAt: row.startedAt.toISOString(),
    endedAt: iso(row.endedAt),
    durationSeconds: row.durationSeconds,
  };
}

function toAppSetting(row: AppSettingRow): AppSetting {
  return { key: row.key, value: row.value, updatedAt: row.updatedAt.toISOString() };
}

function date(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

/** Builds the WHERE fragment shared by pallet-log and award range queries. */
function rangeCondition(column: AnyPgColumn, from?: string, to?: string): SQL[] {
  const conditions: SQL[] = [];
  if (from) conditions.push(gte(column, new Date(from)));
  if (to) conditions.push(lt(column, new Date(to)));
  return conditions;
}

/** Translates PostgreSQL constraint errors into typed repository errors. */
function translateError(error: unknown, fallbackMessage: string): never {
  const code = (error as { code?: string } | null)?.code;
  const constraint = (error as { constraint?: string } | null)?.constraint ?? '';
  const detail = (error as { detail?: string } | null)?.detail ?? '';

  if (code === '23505') {
    if (constraint.includes('emoji')) {
      throw new RepositoryError('worker_emoji_duplicate', 'Worker emoji already in use', 409);
    }
    if (constraint.includes('employee_id')) {
      throw new RepositoryError('worker_employee_id_duplicate', 'Employee id already in use', 409);
    }
    if (constraint.includes('production_lines_code')) {
      throw new RepositoryError('line_code_duplicate', 'Line code already in use', 409);
    }
    if (constraint.includes('one_active_per_line')) {
      throw new RepositoryError('line_busy', 'Line already has an active batch', 409);
    }
    if (constraint.includes('single_primary')) {
      throw new RepositoryError('race_primary_conflict', 'Another race is already primary', 409);
    }
    if (constraint.includes('one_open_per_batch')) {
      throw new RepositoryError('batch_already_paused', 'Batch is already paused', 409);
    }
    if (constraint.includes('pallet_sizes_product_cartons')) {
      throw new RepositoryError('pallet_size_duplicate', 'Pallet size already exists', 409);
    }
    throw new RepositoryError('unique_violation', detail || 'Unique constraint violated', 409);
  }

  if (code === '23503') {
    throw new RepositoryError('foreign_key_violation', 'Referenced record does not exist', 409);
  }

  if (code === '23514') {
    throw new RepositoryError('check_violation', detail || 'Value violates a database constraint', 422);
  }

  console.error('[shift] Database error:', error);
  throw new RepositoryError('database_error', fallbackMessage, 500);
}

export class DrizzleRepository implements Repository {
  readonly kind = 'drizzle' as const;

  describe(): string {
    const url = process.env.DATABASE_URL ?? '';
    const host = url.replace(/^.*@/, '').split('/')[0] || 'unknown-host';
    return `Neon PostgreSQL (${host})`;
  }

  /* ------------------------------------------------------------- workers */

  async listWorkers(): Promise<Worker[]> {
    const rows = await getDb().select().from(workers).orderBy(asc(workers.fullName));
    return rows.map(toWorker);
  }

  async getWorkerById(id: string): Promise<Worker | null> {
    const rows = await getDb().select().from(workers).where(eq(workers.id, id)).limit(1);
    return rows[0] ? toWorker(rows[0]) : null;
  }

  async getWorkerByEmployeeId(employeeId: string): Promise<Worker | null> {
    const rows = await getDb()
      .select()
      .from(workers)
      .where(sql`lower(${workers.employeeId}) = lower(${employeeId.trim()})`)
      .limit(1);
    return rows[0] ? toWorker(rows[0]) : null;
  }

  async getWorkerByEmoji(emoji: string): Promise<Worker | null> {
    const rows = await getDb().select().from(workers).where(eq(workers.emoji, emoji.trim())).limit(1);
    return rows[0] ? toWorker(rows[0]) : null;
  }

  async insertWorker(worker: Worker): Promise<Worker> {
    try {
      const rows = await getDb()
        .insert(workers)
        .values({
          id: worker.id,
          fullName: worker.fullName,
          employeeId: worker.employeeId,
          emoji: worker.emoji,
          isActive: worker.isActive,
          createdAt: new Date(worker.createdAt),
        })
        .returning();
      return toWorker(rows[0]);
    } catch (error) {
      translateError(error, 'Failed to create worker');
    }
  }

  async updateWorker(id: string, patch: Partial<Omit<Worker, 'id' | 'createdAt'>>): Promise<Worker> {
    try {
      const rows = await getDb()
        .update(workers)
        .set({
          ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
          ...(patch.employeeId !== undefined ? { employeeId: patch.employeeId } : {}),
          ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        })
        .where(eq(workers.id, id))
        .returning();
      if (!rows[0]) throw new RepositoryError('not_found', 'Worker not found', 404);
      return toWorker(rows[0]);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      translateError(error, 'Failed to update worker');
    }
  }

  async deleteWorker(id: string): Promise<void> {
    try {
      await getDb().delete(workers).where(eq(workers.id, id));
    } catch (error) {
      translateError(error, 'Failed to delete worker');
    }
  }

  /* --------------------------------------------------- production lines */

  async listProductionLines(): Promise<ProductionLine[]> {
    const rows = await getDb()
      .select()
      .from(productionLines)
      .orderBy(asc(productionLines.sortOrder), asc(productionLines.name));
    return rows.map(toProductionLine);
  }

  async getProductionLineById(id: string): Promise<ProductionLine | null> {
    const rows = await getDb().select().from(productionLines).where(eq(productionLines.id, id)).limit(1);
    return rows[0] ? toProductionLine(rows[0]) : null;
  }

  async getProductionLineByCode(code: string): Promise<ProductionLine | null> {
    const rows = await getDb()
      .select()
      .from(productionLines)
      .where(sql`lower(${productionLines.code}) = lower(${code.trim()})`)
      .limit(1);
    return rows[0] ? toProductionLine(rows[0]) : null;
  }

  async insertProductionLine(line: ProductionLine): Promise<ProductionLine> {
    try {
      const rows = await getDb()
        .insert(productionLines)
        .values({
          id: line.id,
          name: line.name,
          code: line.code,
          sortOrder: line.sortOrder,
          isActive: line.isActive,
          createdAt: new Date(line.createdAt),
        })
        .returning();
      return toProductionLine(rows[0]);
    } catch (error) {
      translateError(error, 'Failed to create production line');
    }
  }

  async updateProductionLine(
    id: string,
    patch: Partial<Omit<ProductionLine, 'id' | 'createdAt'>>,
  ): Promise<ProductionLine> {
    try {
      const rows = await getDb()
        .update(productionLines)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.code !== undefined ? { code: patch.code } : {}),
          ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        })
        .where(eq(productionLines.id, id))
        .returning();
      if (!rows[0]) throw new RepositoryError('not_found', 'Production line not found', 404);
      return toProductionLine(rows[0]);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      translateError(error, 'Failed to update production line');
    }
  }

  async deleteProductionLine(id: string): Promise<void> {
    try {
      await getDb().delete(productionLines).where(eq(productionLines.id, id));
    } catch (error) {
      translateError(error, 'Failed to delete production line');
    }
  }

  /* ------------------------------------------------------------ products */

  async listProducts(): Promise<Product[]> {
    const rows = await getDb().select().from(products).orderBy(asc(products.name));
    return rows.map(toProduct);
  }

  async getProductById(id: string): Promise<Product | null> {
    const rows = await getDb().select().from(products).where(eq(products.id, id)).limit(1);
    return rows[0] ? toProduct(rows[0]) : null;
  }

  async insertProduct(product: Product): Promise<Product> {
    try {
      const rows = await getDb()
        .insert(products)
        .values({
          id: product.id,
          name: product.name,
          sku: product.sku,
          sizeLabel: product.sizeLabel,
          cartonsPerLayout: product.cartonsPerLayout,
          pointValue: product.pointValue,
          isActive: product.isActive,
          createdAt: new Date(product.createdAt),
        })
        .returning();
      return toProduct(rows[0]);
    } catch (error) {
      translateError(error, 'Failed to create product');
    }
  }

  async updateProduct(id: string, patch: Partial<Omit<Product, 'id' | 'createdAt'>>): Promise<Product> {
    try {
      const rows = await getDb()
        .update(products)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.sku !== undefined ? { sku: patch.sku } : {}),
          ...(patch.sizeLabel !== undefined ? { sizeLabel: patch.sizeLabel } : {}),
          ...(patch.cartonsPerLayout !== undefined ? { cartonsPerLayout: patch.cartonsPerLayout } : {}),
          ...(patch.pointValue !== undefined ? { pointValue: patch.pointValue } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        })
        .where(eq(products.id, id))
        .returning();
      if (!rows[0]) throw new RepositoryError('not_found', 'Product not found', 404);
      return toProduct(rows[0]);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      translateError(error, 'Failed to update product');
    }
  }

  async deleteProduct(id: string): Promise<void> {
    try {
      await getDb().delete(products).where(eq(products.id, id));
    } catch (error) {
      translateError(error, 'Failed to delete product');
    }
  }

  /* -------------------------------------------------------- pallet sizes */

  async listPalletSizes(): Promise<PalletSize[]> {
    const rows = await getDb().select().from(palletSizes).orderBy(asc(palletSizes.sortOrder));
    return rows.map(toPalletSize);
  }

  async listPalletSizesByProduct(productId: string): Promise<PalletSize[]> {
    const rows = await getDb()
      .select()
      .from(palletSizes)
      .where(eq(palletSizes.productId, productId))
      .orderBy(asc(palletSizes.sortOrder), asc(palletSizes.cartons));
    return rows.map(toPalletSize);
  }

  async getPalletSizeById(id: string): Promise<PalletSize | null> {
    const rows = await getDb().select().from(palletSizes).where(eq(palletSizes.id, id)).limit(1);
    return rows[0] ? toPalletSize(rows[0]) : null;
  }

  async insertPalletSize(size: PalletSize): Promise<PalletSize> {
    try {
      const rows = await getDb()
        .insert(palletSizes)
        .values({
          id: size.id,
          productId: size.productId,
          label: size.label,
          cartons: size.cartons,
          sortOrder: size.sortOrder,
        })
        .returning();
      return toPalletSize(rows[0]);
    } catch (error) {
      translateError(error, 'Failed to create pallet size');
    }
  }

  async updatePalletSize(id: string, patch: Partial<Omit<PalletSize, 'id' | 'productId'>>): Promise<PalletSize> {
    try {
      const rows = await getDb()
        .update(palletSizes)
        .set({
          ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.cartons !== undefined ? { cartons: patch.cartons } : {}),
          ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        })
        .where(eq(palletSizes.id, id))
        .returning();
      if (!rows[0]) throw new RepositoryError('not_found', 'Pallet size not found', 404);
      return toPalletSize(rows[0]);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      translateError(error, 'Failed to update pallet size');
    }
  }

  async deletePalletSize(id: string): Promise<void> {
    await getDb().delete(palletSizes).where(eq(palletSizes.id, id));
  }

  async deletePalletSizesByProduct(productId: string): Promise<void> {
    await getDb().delete(palletSizes).where(eq(palletSizes.productId, productId));
  }

  /* --------------------------------------------------------------- races */

  async listRaces(filter?: RaceFilter): Promise<Race[]> {
    const conditions: SQL[] = [];
    if (filter?.status) conditions.push(eq(races.status, filter.status));
    if (filter?.isPrimary !== undefined) conditions.push(eq(races.isPrimary, filter.isPrimary));

    const base = getDb().select().from(races);
    const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;
    const rows = await filtered.orderBy(desc(races.startAt));
    return rows.map(toRace);
  }

  async getRaceById(id: string): Promise<Race | null> {
    const rows = await getDb().select().from(races).where(eq(races.id, id)).limit(1);
    return rows[0] ? toRace(rows[0]) : null;
  }

  async getPrimaryRace(): Promise<Race | null> {
    const rows = await getDb()
      .select()
      .from(races)
      .where(and(eq(races.status, 'ACTIVE'), eq(races.isPrimary, true)))
      .orderBy(desc(races.startAt))
      .limit(1);
    return rows[0] ? toRace(rows[0]) : null;
  }

  async insertRace(race: Race): Promise<Race> {
    try {
      const rows = await getDb()
        .insert(races)
        .values({
          id: race.id,
          name: race.name,
          prizeDescription: race.prizeDescription,
          startAt: new Date(race.startAt),
          endAt: date(race.endAt),
          minActiveHours: race.minActiveHours,
          status: race.status,
          isPrimary: race.isPrimary,
          archiveNote: race.archiveNote,
          createdAt: new Date(race.createdAt),
        })
        .returning();
      return toRace(rows[0]);
    } catch (error) {
      translateError(error, 'Failed to create race');
    }
  }

  async updateRace(id: string, patch: Partial<Omit<Race, 'id' | 'createdAt'>>): Promise<Race> {
    try {
      const rows = await getDb()
        .update(races)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.prizeDescription !== undefined ? { prizeDescription: patch.prizeDescription } : {}),
          ...(patch.startAt !== undefined ? { startAt: new Date(patch.startAt) } : {}),
          ...(patch.endAt !== undefined ? { endAt: date(patch.endAt) } : {}),
          ...(patch.minActiveHours !== undefined ? { minActiveHours: patch.minActiveHours } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.isPrimary !== undefined ? { isPrimary: patch.isPrimary } : {}),
          ...(patch.archiveNote !== undefined ? { archiveNote: patch.archiveNote } : {}),
        })
        .where(eq(races.id, id))
        .returning();
      if (!rows[0]) throw new RepositoryError('not_found', 'Race not found', 404);
      return toRace(rows[0]);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      translateError(error, 'Failed to update race');
    }
  }

  /**
   * Deletes a race. `point_awards.race_id` cascades, so only this race's own
   * ledger rows are removed — no other race, batch or pallet is affected.
   */
  async deleteRace(id: string): Promise<void> {
    await getDb().delete(races).where(eq(races.id, id));
  }

  async listExpiredActiveRaces(now: string): Promise<Race[]> {
    const rows = await getDb()
      .select()
      .from(races)
      .where(
        and(
          eq(races.status, 'ACTIVE'),
          sql`${races.endAt} is not null`,
          lte(races.endAt, new Date(now)),
        ),
      );
    return rows.map(toRace);
  }

 /**
   * Promotes one race to primary and demotes every other in a transaction.
   */
  async setPrimaryRace(id: string): Promise<Race | null> {
    try {
      const db = getDb();
      await db.transaction(async (tx) => {
        // Demote all races first
        await tx.update(races).set({ isPrimary: false });
        // Promote the target race
        await tx.update(races).set({ isPrimary: true }).where(eq(races.id, id));
      });
      return this.getRaceById(id);
    } catch (error) {
      translateError(error, 'Failed to set the primary race');
    }
  }

  async clearPrimaryRace(): Promise<void> {
    await getDb().update(races).set({ isPrimary: false }).where(eq(races.isPrimary, true));
  }

  /* --------------------------------------------------- race point values */

  async listRaceProductPoints(raceId?: string): Promise<RaceProductPoint[]> {
    const base = getDb().select().from(raceProductPoints);
    const rows = raceId ? await base.where(eq(raceProductPoints.raceId, raceId)) : await base;
    return rows.map(toRaceProductPoint);
  }

  async insertRaceProductPoint(row: RaceProductPoint): Promise<RaceProductPoint> {
    try {
      const rows = await getDb()
        .insert(raceProductPoints)
        .values({
          id: row.id,
          raceId: row.raceId,
          productId: row.productId,
          pointValue: row.pointValue,
        })
        .returning();
      return toRaceProductPoint(rows[0]);
    } catch (error) {
      translateError(error, 'Failed to create race point override');
    }
  }

  async updateRaceProductPoint(
    id: string,
    patch: Partial<Omit<RaceProductPoint, 'id'>>,
  ): Promise<RaceProductPoint> {
    try {
      const rows = await getDb()
        .update(raceProductPoints)
        .set({
          ...(patch.raceId !== undefined ? { raceId: patch.raceId } : {}),
          ...(patch.productId !== undefined ? { productId: patch.productId } : {}),
          ...(patch.pointValue !== undefined ? { pointValue: patch.pointValue } : {}),
        })
        .where(eq(raceProductPoints.id, id))
        .returning();
      if (!rows[0]) throw new RepositoryError('not_found', 'Race point override not found', 404);
      return toRaceProductPoint(rows[0]);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      translateError(error, 'Failed to update race point override');
    }
  }

  async deleteRaceProductPointsByRace(raceId: string): Promise<void> {
    await getDb().delete(raceProductPoints).where(eq(raceProductPoints.raceId, raceId));
  }

  async deleteRaceProductPoint(id: string): Promise<void> {
    await getDb().delete(raceProductPoints).where(eq(raceProductPoints.id, id));
  }

  /* ------------------------------------------------------------- batches */

  async listBatches(filter?: BatchFilter): Promise<Batch[]> {
    const conditions: SQL[] = [];
    if (filter?.status) conditions.push(eq(batches.status, filter.status));
    if (filter?.lineId) conditions.push(eq(batches.lineId, filter.lineId));
    if (filter?.productId) conditions.push(eq(batches.productId, filter.productId));
    if (filter?.from) conditions.push(gte(batches.startedAt, new Date(filter.from)));
    if (filter?.to) conditions.push(lt(batches.startedAt, new Date(filter.to)));

    const base = getDb().select().from(batches);
    const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;
    const ordered = filtered.orderBy(desc(batches.startedAt));
    const rows = filter?.limit ? await ordered.limit(filter.limit) : await ordered;
    return rows.map(toBatch);
  }

  async getBatchById(id: string): Promise<Batch | null> {
    const rows = await getDb().select().from(batches).where(eq(batches.id, id)).limit(1);
    return rows[0] ? toBatch(rows[0]) : null;
  }

  async getActiveBatchByLine(lineId: string): Promise<Batch | null> {
    const rows = await getDb()
      .select()
      .from(batches)
      .where(and(eq(batches.lineId, lineId), eq(batches.status, 'ACTIVE')))
      .limit(1);
    return rows[0] ? toBatch(rows[0]) : null;
  }

  async listActiveBatches(): Promise<Batch[]> {
    const rows = await getDb().select().from(batches).where(eq(batches.status, 'ACTIVE'));
    return rows.map(toBatch);
  }

  async insertBatch(batch: Batch): Promise<Batch> {
    try {
      const rows = await getDb()
        .insert(batches)
        .values({
          id: batch.id,
          lineId: batch.lineId,
          productId: batch.productId,
          startedAt: new Date(batch.startedAt),
          finishedAt: date(batch.finishedAt),
          totalElapsedSeconds: batch.totalElapsedSeconds,
          activeSeconds: batch.activeSeconds,
          pausedSeconds: batch.pausedSeconds,
          totalCartons: batch.totalCartons,
          totalPoints: batch.totalPoints,
          status: batch.status,
          notes: batch.notes,
          createdAt: new Date(batch.createdAt),
        })
        .returning();
      return toBatch(rows[0]);
    } catch (error) {
      translateError(error, 'Failed to create batch');
    }
  }

  async updateBatch(id: string, patch: Partial<Omit<Batch, 'id' | 'createdAt'>>): Promise<Batch> {
    try {
      const rows = await getDb()
        .update(batches)
        .set({
          ...(patch.lineId !== undefined ? { lineId: patch.lineId } : {}),
          ...(patch.productId !== undefined ? { productId: patch.productId } : {}),
          ...(patch.startedAt !== undefined ? { startedAt: new Date(patch.startedAt) } : {}),
          ...(patch.finishedAt !== undefined ? { finishedAt: date(patch.finishedAt) } : {}),
          ...(patch.totalElapsedSeconds !== undefined ? { totalElapsedSeconds: patch.totalElapsedSeconds } : {}),
          ...(patch.activeSeconds !== undefined ? { activeSeconds: patch.activeSeconds } : {}),
          ...(patch.pausedSeconds !== undefined ? { pausedSeconds: patch.pausedSeconds } : {}),
          ...(patch.totalCartons !== undefined ? { totalCartons: patch.totalCartons } : {}),
          ...(patch.totalPoints !== undefined ? { totalPoints: patch.totalPoints } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        })
        .where(eq(batches.id, id))
        .returning();
      if (!rows[0]) throw new RepositoryError('not_found', 'Batch not found', 404);
      return toBatch(rows[0]);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      translateError(error, 'Failed to update batch');
    }
  }

  async deleteBatch(id: string): Promise<void> {
    await getDb().delete(batches).where(eq(batches.id, id));
  }

  /* ------------------------------------------------------- batch members */

  async listBatchMembers(batchId: string): Promise<BatchMember[]> {
    const rows = await getDb()
      .select()
      .from(batchMembers)
      .where(eq(batchMembers.batchId, batchId))
      .orderBy(asc(batchMembers.joinedAt));
    return rows.map(toBatchMember);
  }

  async listBatchMembersForBatches(batchIds: string[]): Promise<BatchMember[]> {
    if (batchIds.length === 0) return [];
    const rows = await getDb().select().from(batchMembers).where(inArray(batchMembers.batchId, batchIds));
    return rows.map(toBatchMember);
  }

  async insertBatchMember(member: BatchMember): Promise<BatchMember> {
    try {
      const rows = await getDb()
        .insert(batchMembers)
        .values({
          id: member.id,
          batchId: member.batchId,
          workerId: member.workerId,
          joinedAt: new Date(member.joinedAt),
          leftAt: date(member.leftAt),
        })
        .returning();
      return toBatchMember(rows[0]);
    } catch (error) {
      translateError(error, 'Failed to add batch member');
    }
  }

  async updateBatchMember(
    id: string,
    patch: Partial<Omit<BatchMember, 'id' | 'batchId' | 'workerId'>>,
  ): Promise<BatchMember> {
    try {
      const rows = await getDb()
        .update(batchMembers)
        .set({
          ...(patch.joinedAt !== undefined ? { joinedAt: new Date(patch.joinedAt) } : {}),
          ...(patch.leftAt !== undefined ? { leftAt: date(patch.leftAt) } : {}),
        })
        .where(eq(batchMembers.id, id))
        .returning();
      if (!rows[0]) throw new RepositoryError('not_found', 'Batch member not found', 404);
      return toBatchMember(rows[0]);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      translateError(error, 'Failed to update batch member');
    }
  }

  /* --------------------------------------------------------- pallet logs */

  async listPalletLogsByBatch(batchId: string): Promise<PalletLog[]> {
    const rows = await getDb()
      .select()
      .from(palletLogs)
      .where(eq(palletLogs.batchId, batchId))
      .orderBy(asc(palletLogs.createdAt));
    return rows.map(toPalletLog);
  }

  async listPalletLogsForBatches(batchIds: string[]): Promise<PalletLog[]> {
    if (batchIds.length === 0) return [];
    const rows = await getDb().select().from(palletLogs).where(inArray(palletLogs.batchId, batchIds));
    return rows.map(toPalletLog);
  }

  async listPalletLogsByIds(ids: string[]): Promise<PalletLog[]> {
    if (ids.length === 0) return [];
    const rows = await getDb().select().from(palletLogs).where(inArray(palletLogs.id, ids));
    return rows.map(toPalletLog);
  }

  async listPalletLogs(filter?: PalletLogFilter): Promise<PalletLog[]> {
    const conditions: SQL[] = [...rangeCondition(palletLogs.createdAt, filter?.from, filter?.to)];
    if (filter?.productId) conditions.push(eq(palletLogs.productId, filter.productId));
    if (filter?.lineId) {
      conditions.push(
        inArray(
          palletLogs.batchId,
          getDb().select({ id: batches.id }).from(batches).where(eq(batches.lineId, filter.lineId)),
        ),
      );
    }

    const base = getDb().select().from(palletLogs);
    const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;
    const ordered = filtered.orderBy(desc(palletLogs.createdAt));
    const rows = filter?.limit ? await ordered.limit(filter.limit) : await ordered;
    return rows.map(toPalletLog);
  }

  /**
   * Inserts the pallet and its point awards in a single round trip.
   *
   * With concurrent-race scoring the award list contains one row per
   * (worker × race that was ACTIVE at logging time), so a three-person crew and
   * two active races produce six rows — all written atomically with the pallet.
   *
   * `neon-http` is stateless and does not expose interactive transactions, so
   * `db.batch()` is used instead: Neon executes the whole array as one implicit
   * transaction, which guarantees the ledger can never contain a pallet without
   * its matching awards.
   */
  async insertPalletWithAwards(payload: PalletWithAwards): Promise<PalletLog> {
    const db = getDb();

    const palletStatement = db.insert(palletLogs).values({
      id: payload.pallet.id,
      batchId: payload.pallet.batchId,
      productId: payload.pallet.productId,
      palletSizeId: payload.pallet.palletSizeId,
      cartons: payload.pallet.cartons,
      pointValue: payload.pallet.pointValue,
      totalPoints: payload.pallet.totalPoints,
      note: payload.pallet.note,
      createdAt: new Date(payload.pallet.createdAt),
    });

    const awardStatements = payload.awards.map((award) =>
      db.insert(pointAwards).values({
        id: award.id,
        batchId: award.batchId,
        palletLogId: award.palletLogId,
        raceId: award.raceId,
        workerId: award.workerId,
        points: award.points,
        createdAt: new Date(award.createdAt),
      }),
    );

    const statements = [palletStatement, ...awardStatements];

    try {
      // `db.batch` is typed against a tuple; the array is built dynamically from
      // the crew size times the active-race count, so the cast is required.
      await (db as unknown as { batch: (items: unknown[]) => Promise<unknown> }).batch(statements);
      return payload.pallet;
    } catch (error) {
      translateError(error, 'Failed to record pallet');
    }
  }

  /** `point_awards.pallet_log_id` cascades, so one delete is enough. */
  async deletePalletLog(id: string): Promise<void> {
    await getDb().delete(palletLogs).where(eq(palletLogs.id, id));
  }

  async deletePalletLogsByBatch(batchId: string): Promise<void> {
    await getDb().delete(palletLogs).where(eq(palletLogs.batchId, batchId));
  }

  /* -------------------------------------------------------- point awards */

  async listPointAwardsByBatch(batchId: string): Promise<PointAward[]> {
    const rows = await getDb().select().from(pointAwards).where(eq(pointAwards.batchId, batchId));
    return rows.map(toPointAward);
  }

  async listPointAwardsForBatches(batchIds: string[]): Promise<PointAward[]> {
    if (batchIds.length === 0) return [];
    const rows = await getDb().select().from(pointAwards).where(inArray(pointAwards.batchId, batchIds));
    return rows.map(toPointAward);
  }

  async listPointAwards(filter?: PointAwardFilter): Promise<PointAward[]> {
    const conditions: SQL[] = [...rangeCondition(pointAwards.createdAt, filter?.from, filter?.to)];
    if (filter?.raceId) conditions.push(eq(pointAwards.raceId, filter.raceId));

    const base = getDb().select().from(pointAwards);
    const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;
    const ordered = filtered.orderBy(desc(pointAwards.createdAt));
    const rows = filter?.limit ? await ordered.limit(filter.limit) : await ordered;
    return rows.map(toPointAward);
  }

  /* ----------------------------------------------------------- pause logs */

  async listPauseLogsByBatch(batchId: string): Promise<PauseLog[]> {
    const rows = await getDb()
      .select()
      .from(pauseLogs)
      .where(eq(pauseLogs.batchId, batchId))
      .orderBy(asc(pauseLogs.startedAt));
    return rows.map(toPauseLog);
  }

  async listPauseLogsForBatches(batchIds: string[]): Promise<PauseLog[]> {
    if (batchIds.length === 0) return [];
    const rows = await getDb().select().from(pauseLogs).where(inArray(pauseLogs.batchId, batchIds));
    return rows.map(toPauseLog);
  }

  async getOpenPause(batchId: string): Promise<PauseLog | null> {
    const rows = await getDb()
      .select()
      .from(pauseLogs)
      .where(and(eq(pauseLogs.batchId, batchId), sql`${pauseLogs.endedAt} is null`))
      .limit(1);
    return rows[0] ? toPauseLog(rows[0]) : null;
  }

  async insertPauseLog(pause: PauseLog): Promise<PauseLog> {
    try {
      const rows = await getDb()
        .insert(pauseLogs)
        .values({
          id: pause.id,
          batchId: pause.batchId,
          reasonCode: pause.reasonCode,
          reasonLabel: pause.reasonLabel,
          startedAt: new Date(pause.startedAt),
          endedAt: date(pause.endedAt),
          durationSeconds: pause.durationSeconds,
        })
        .returning();
      return toPauseLog(rows[0]);
    } catch (error) {
      translateError(error, 'Failed to start pause');
    }
  }

  async updatePauseLog(id: string, patch: Partial<Omit<PauseLog, 'id' | 'batchId'>>): Promise<PauseLog> {
    try {
      const rows = await getDb()
        .update(pauseLogs)
        .set({
          ...(patch.reasonCode !== undefined ? { reasonCode: patch.reasonCode } : {}),
          ...(patch.reasonLabel !== undefined ? { reasonLabel: patch.reasonLabel } : {}),
          ...(patch.startedAt !== undefined ? { startedAt: new Date(patch.startedAt) } : {}),
          ...(patch.endedAt !== undefined ? { endedAt: date(patch.endedAt) } : {}),
          ...(patch.durationSeconds !== undefined ? { durationSeconds: patch.durationSeconds } : {}),
        })
        .where(eq(pauseLogs.id, id))
        .returning();
      if (!rows[0]) throw new RepositoryError('not_found', 'Pause log not found', 404);
      return toPauseLog(rows[0]);
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      translateError(error, 'Failed to update pause');
    }
  }

  async listPauseLogsInRange(from: string, to: string): Promise<PauseLog[]> {
    const rows = await getDb()
      .select()
      .from(pauseLogs)
      .where(and(gte(pauseLogs.startedAt, new Date(from)), lt(pauseLogs.startedAt, new Date(to))));
    return rows.map(toPauseLog);
  }

  /* ------------------------------------------------------------ settings */

  async listSettings(): Promise<AppSetting[]> {
    const rows = await getDb().select().from(appSettings);
    return rows.map(toAppSetting);
  }

  async getSetting(key: string): Promise<string | null> {
    const rows = await getDb().select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return rows[0]?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<AppSetting> {
    const rows = await getDb()
      .insert(appSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } })
      .returning();
    return toAppSetting(rows[0]);
  }

  /* ------------------------------------------------------------ bulk ops */

  /**
   * Deletes all operational data in FK-safe order. `production_lines`,
   * `races`, `products` and `workers` are referenced with ON DELETE RESTRICT by
   * historical rows, so children are removed first.
   */
  async truncateAll(): Promise<void> {
    const db = getDb();
    await db.delete(pointAwards);
    await db.delete(palletLogs);
    await db.delete(pauseLogs);
    await db.delete(batchMembers);
    await db.delete(batches);
    await db.delete(palletSizes);
    await db.delete(raceProductPoints);
    await db.delete(races);
    await db.delete(products);
    await db.delete(productionLines);
    await db.delete(workers);
    await db.delete(appSettings);
  }
}
