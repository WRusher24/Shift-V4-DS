/**
 * Persistence abstraction.
 *
 * The service layer (`lib/services/*`) never talks to a database driver
 * directly. It depends only on this interface, which is implemented twice:
 *
 *   - `DrizzleRepository` (`lib/repo/drizzle-repository.ts`)
 *       Production adapter. Neon PostgreSQL through `drizzle-orm/neon-http`.
 *
 *   - `LocalRepository` (`lib/repo/local-repository.ts`)
 *       Zero-configuration adapter backed by a JSON file. Used for local
 *       development, evaluation, automated tests and demos, and selected
 *       automatically whenever `DATABASE_URL` is empty.
 *
 * Both adapters return the same canonical domain types (`lib/domain/types.ts`)
 * with ISO-8601 timestamps, so services and API routes are storage-agnostic.
 */

import type {
  AppSetting,
  Batch,
  BatchMember,
  BatchStatus,
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

export interface BatchFilter {
  status?: BatchStatus;
  lineId?: string;
  productId?: string;
  /** Inclusive lower bound on `startedAt`. */
  from?: string;
  /** Exclusive upper bound on `startedAt`. */
  to?: string;
  limit?: number;
}

export interface RaceFilter {
  status?: Race['status'];
  isPrimary?: boolean;
}

export interface PalletLogFilter {
  productId?: string;
  lineId?: string;
  /** Inclusive lower bound on `createdAt`. */
  from?: string;
  /** Exclusive upper bound on `createdAt`. */
  to?: string;
  limit?: number;
}

export interface PointAwardFilter {
  raceId?: string;
  /** Inclusive lower bound on `createdAt`. */
  from?: string;
  /** Exclusive upper bound on `createdAt`. */
  to?: string;
  limit?: number;
}

/** A pallet plus the point awards it generated, persisted atomically. */
export interface PalletWithAwards {
  pallet: PalletLog;
  awards: PointAward[];
}

export interface Repository {
  readonly kind: 'drizzle' | 'local';

  /** Human-readable description surfaced in the admin UI / logs. */
  describe(): string;

  /* ------------------------------------------------------------- workers */
  listWorkers(): Promise<Worker[]>;
  getWorkerById(id: string): Promise<Worker | null>;
  getWorkerByEmployeeId(employeeId: string): Promise<Worker | null>;
  getWorkerByEmoji(emoji: string): Promise<Worker | null>;
  insertWorker(worker: Worker): Promise<Worker>;
  updateWorker(id: string, patch: Partial<Omit<Worker, 'id' | 'createdAt'>>): Promise<Worker>;
  deleteWorker(id: string): Promise<void>;

  /* --------------------------------------------------- production lines */
  listProductionLines(): Promise<ProductionLine[]>;
  getProductionLineById(id: string): Promise<ProductionLine | null>;
  getProductionLineByCode(code: string): Promise<ProductionLine | null>;
  insertProductionLine(line: ProductionLine): Promise<ProductionLine>;
  updateProductionLine(
    id: string,
    patch: Partial<Omit<ProductionLine, 'id' | 'createdAt'>>,
  ): Promise<ProductionLine>;
  deleteProductionLine(id: string): Promise<void>;

  /* ------------------------------------------------------------ products */
  listProducts(): Promise<Product[]>;
  getProductById(id: string): Promise<Product | null>;
  insertProduct(product: Product): Promise<Product>;
  updateProduct(id: string, patch: Partial<Omit<Product, 'id' | 'createdAt'>>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  /* -------------------------------------------------------- pallet sizes */
  listPalletSizes(): Promise<PalletSize[]>;
  listPalletSizesByProduct(productId: string): Promise<PalletSize[]>;
  getPalletSizeById(id: string): Promise<PalletSize | null>;
  insertPalletSize(size: PalletSize): Promise<PalletSize>;
  updatePalletSize(id: string, patch: Partial<Omit<PalletSize, 'id' | 'productId'>>): Promise<PalletSize>;
  deletePalletSize(id: string): Promise<void>;
  deletePalletSizesByProduct(productId: string): Promise<void>;

  /* --------------------------------------------------------------- races */
  listRaces(filter?: RaceFilter): Promise<Race[]>;
  getRaceById(id: string): Promise<Race | null>;
  /** The race surfaced by default — a display preference, not a scoring filter. */
  getPrimaryRace(): Promise<Race | null>;
  insertRace(race: Race): Promise<Race>;
  updateRace(id: string, patch: Partial<Omit<Race, 'id' | 'createdAt'>>): Promise<Race>;
  /**
   * Removes a race together with its own ledger rows. `point_awards.race_id`
   * cascades, so no other race, batch or pallet is touched.
   */
  deleteRace(id: string): Promise<void>;
  /**
   * Makes `id` the single primary ACTIVE race, clearing the flag from every
   * other race. Returns the promoted race.
   */
  setPrimaryRace(id: string): Promise<Race | null>;
  /** Clears the primary flag from every ACTIVE race. */
  clearPrimaryRace(): Promise<void>;
  /** ACTIVE races whose `endAt` has already passed. Drives the auto-archiver. */
  listExpiredActiveRaces(now: string): Promise<Race[]>;

  /* --------------------------------------------------- race point values */
  listRaceProductPoints(raceId?: string): Promise<RaceProductPoint[]>;
  insertRaceProductPoint(row: RaceProductPoint): Promise<RaceProductPoint>;
  updateRaceProductPoint(id: string, patch: Partial<Omit<RaceProductPoint, 'id'>>): Promise<RaceProductPoint>;
  deleteRaceProductPointsByRace(raceId: string): Promise<void>;
  deleteRaceProductPoint(id: string): Promise<void>;

  /* ------------------------------------------------------------- batches */
  listBatches(filter?: BatchFilter): Promise<Batch[]>;
  getBatchById(id: string): Promise<Batch | null>;
  getActiveBatchByLine(lineId: string): Promise<Batch | null>;
  listActiveBatches(): Promise<Batch[]>;
  insertBatch(batch: Batch): Promise<Batch>;
  updateBatch(id: string, patch: Partial<Omit<Batch, 'id' | 'createdAt'>>): Promise<Batch>;
  deleteBatch(id: string): Promise<void>;

  /* ------------------------------------------------------- batch members */
  listBatchMembers(batchId: string): Promise<BatchMember[]>;
  listBatchMembersForBatches(batchIds: string[]): Promise<BatchMember[]>;
  insertBatchMember(member: BatchMember): Promise<BatchMember>;
  updateBatchMember(id: string, patch: Partial<Omit<BatchMember, 'id' | 'batchId' | 'workerId'>>): Promise<BatchMember>;

  /* --------------------------------------------------------- pallet logs */
  listPalletLogsByBatch(batchId: string): Promise<PalletLog[]>;
  listPalletLogsForBatches(batchIds: string[]): Promise<PalletLog[]>;
  listPalletLogsByIds(ids: string[]): Promise<PalletLog[]>;
  listPalletLogs(filter?: PalletLogFilter): Promise<PalletLog[]>;
  insertPalletWithAwards(payload: PalletWithAwards): Promise<PalletLog>;
  /** Removes a pallet together with every point award it produced. */
  deletePalletLog(id: string): Promise<void>;
  deletePalletLogsByBatch(batchId: string): Promise<void>;

  /* -------------------------------------------------------- point awards */
  listPointAwardsByBatch(batchId: string): Promise<PointAward[]>;
  listPointAwardsForBatches(batchIds: string[]): Promise<PointAward[]>;
  listPointAwards(filter?: PointAwardFilter): Promise<PointAward[]>;

  /* ----------------------------------------------------------- pause logs */
  listPauseLogsByBatch(batchId: string): Promise<PauseLog[]>;
  listPauseLogsForBatches(batchIds: string[]): Promise<PauseLog[]>;
  getOpenPause(batchId: string): Promise<PauseLog | null>;
  insertPauseLog(pause: PauseLog): Promise<PauseLog>;
  updatePauseLog(id: string, patch: Partial<Omit<PauseLog, 'id' | 'batchId'>>): Promise<PauseLog>;
  listPauseLogsInRange(from: string, to: string): Promise<PauseLog[]>;

  /* ------------------------------------------------------------ settings */
  listSettings(): Promise<AppSetting[]>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<AppSetting>;

  /* ------------------------------------------------------------ bulk ops */
  /** Wipes every table. Used by the seed script and by tests. */
  truncateAll(): Promise<void>;
}

export class RepositoryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
    this.status = status;
  }
}
