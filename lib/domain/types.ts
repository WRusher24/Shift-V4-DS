/**
 * Canonical domain types for the Shift platform.
 *
 * These types are the single source of truth shared by:
 *   - the Drizzle/PostgreSQL persistence layer (`lib/db/*`)
 *   - the local JSON file store (`lib/repo/local-repository.ts`)
 *   - the service layer (`lib/services/*`)
 *   - the HTTP API surface (`app/api/*`)
 *
 * Identifiers are camelCase in TypeScript and snake_case in SQL. Timestamps are
 * carried across the wire as ISO-8601 strings so that the same payload shape is
 * valid for both persistence adapters.
 */

export type ISODateString = string;

export type BatchStatus = 'ACTIVE' | 'COMPLETED';

export type RaceStatus = 'ACTIVE' | 'FINISHED';

/**
 * Preset downtime categories offered when a crew pauses a batch. Free-text
 * notes are stored alongside so supervisors can add detail without losing the
 * structured category used by the downtime report.
 */
export type PauseReasonCode =
  | 'BOTTLE_MATERIAL_SHORTAGE'
  | 'MACHINE_MAINTENANCE'
  | 'CHANGEOVER_CLEANING'
  | 'WORKER_BREAK'
  | 'QUALITY_HOLD'
  | 'OTHER';

export const PAUSE_REASON_CODES: readonly PauseReasonCode[] = [
  'BOTTLE_MATERIAL_SHORTAGE',
  'MACHINE_MAINTENANCE',
  'CHANGEOVER_CLEANING',
  'WORKER_BREAK',
  'QUALITY_HOLD',
  'OTHER',
] as const;

/**
 * The panels available to the TV Mode rotation.
 *
 * Which of them are actually shown is an administrator choice, stored as the
 * `tv_panels` setting and edited with checkboxes in the settings screen.
 */
export type TvPanelKey =
  | 'leaderboard_volume'
  | 'leaderboard_efficiency'
  | 'active_batches'
  | 'daily'
  | 'race_stats';

export const TV_PANEL_KEYS: readonly TvPanelKey[] = [
  'leaderboard_volume',
  'leaderboard_efficiency',
  'active_batches',
  'daily',
  'race_stats',
] as const;

/** The default rotation, used when the setting has never been written. */
export const DEFAULT_TV_PANELS: readonly TvPanelKey[] = TV_PANEL_KEYS;

/* -------------------------------------------------------------------------- */
/*  Persisted rows                                                            */
/* -------------------------------------------------------------------------- */

export interface Worker {
  id: string;
  fullName: string;
  employeeId: string;
  /** Unique profile emoji — enforced unique across all workers. */
  emoji: string;
  isActive: boolean;
  createdAt: ISODateString;
}

/**
 * A physical filling / packaging line.
 *
 * Lines are fully dynamic: supervisors create, rename, reorder and retire them
 * from the admin console. The station dashboard renders one live card per active
 * line, so the factory can grow from two lines to five without a deployment.
 */
export interface ProductionLine {
  id: string;
  /** Display name shown on the floor — free text, Hebrew / Arabic / English. */
  name: string;
  /** Short badge used in dense tables and CSV exports, e.g. "A". */
  code: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: ISODateString;
}

export interface Product {
  id: string;
  /** Free text — Hebrew, Arabic or English. */
  name: string;
  /** Optional SKU / catalogue code printed on the line paperwork. */
  sku: string | null;
  /** Bottle / gallon size label, e.g. "1 ליטר". */
  sizeLabel: string;
  /** Cartons produced by one full carton layout cycle. */
  cartonsPerLayout: number;
  /** Default points awarded per carton. Complexity / value multiplier per SKU. */
  pointValue: number;
  isActive: boolean;
  createdAt: ISODateString;
}

/** A predefined pallet option belonging to a product (e.g. 28 or 32 cartons). */
export interface PalletSize {
  id: string;
  productId: string;
  label: string;
  cartons: number;
  sortOrder: number;
}

export interface Race {
  id: string;
  name: string;
  prizeDescription: string | null;
  startAt: ISODateString;
  /** When set, the race is auto-archived the moment this instant passes. */
  endAt: ISODateString | null;
  /** Minimum active hours required to qualify for the efficiency prize. */
  minActiveHours: number;
  status: RaceStatus;
  /**
   * The race surfaced by default on the station sidebar, the app header and TV
   * Mode, and the one the leaderboard opens on.
   *
   * Several races may be ACTIVE simultaneously and **every** one of them
   * accumulates points from every running batch; "primary" is purely a display
   * default, not a scoring filter.
   */
  isPrimary: boolean;
  /** Optional free-text note recorded when the race was closed. */
  archiveNote: ISODateString | null;
  createdAt: ISODateString;
}

/**
 * A per-race override of a product's point multiplier.
 *
 * Point values live on the product (the SKU's inherent complexity), but a race
 * may deliberately weight a product differently — a promotion, a quality push,
 * a new SKU ramping up. When a race is cloned "as a template" these overrides
 * carry over, so a recurring monthly race does not have to be rebuilt by hand.
 */
export interface RaceProductPoint {
  id: string;
  raceId: string;
  productId: string;
  pointValue: number;
}

export interface Batch {
  id: string;
  lineId: string;
  productId: string;
  startedAt: ISODateString;
  finishedAt: ISODateString | null;
  /** Snapshot written when the batch is finished. Null while running. */
  totalElapsedSeconds: number | null;
  activeSeconds: number | null;
  pausedSeconds: number | null;
  totalCartons: number | null;
  totalPoints: number | null;
  status: BatchStatus;
  notes: string | null;
  createdAt: ISODateString;
}

/**
 * A membership interval on a batch. `leftAt === null` means the worker is
 * currently on the batch. Point splits always use the members whose interval
 * covers the moment the pallet is logged.
 */
export interface BatchMember {
  id: string;
  batchId: string;
  workerId: string;
  joinedAt: ISODateString;
  leftAt: ISODateString | null;
}

export interface PalletLog {
  id: string;
  batchId: string;
  productId: string;
  /** Null when the operator typed a custom carton count. */
  palletSizeId: string | null;
  cartons: number;
  /** Snapshot of the product's base `pointValue` at the moment of logging. */
  pointValue: number;
  /**
   * The pallet's points at the product's **base** multiplier:
   * `cartons × pointValue`.
   *
   * A race may weight the product differently, so the points this pallet
   * contributes to a given race can differ — that per-race figure lives on the
   * `point_awards` rows, one per (worker × active race).
   */
  totalPoints: number;
  note: string | null;
  createdAt: ISODateString;
}

/**
 * Immutable per-worker, per-race point ledger.
 *
 * **Fan-out model.** A batch is not tied to a race. When a pallet is logged it
 * is attributed to **every race that is ACTIVE at that instant**, and one award
 * row is written for each (worker × active race) pair:
 *
 *   pallet 28 cartons × 3 crew × 2 active races = 6 award rows
 *
 * That is what makes "all active batches contribute to all active races
 * concurrently" work, and it keeps each race's leaderboard a single indexed
 * scan. Each award carries the multiplier of *its own* race, so the same pallet
 * can legitimately be worth different amounts in different races.
 *
 * Opening a new race needs no destructive write and no batch restart: no award
 * carries the new race id yet, so its counters start at zero, and the very next
 * pallet logged on any line contributes to it automatically.
 */
export interface PointAward {
  id: string;
  batchId: string;
  palletLogId: string;
  raceId: string;
  workerId: string;
  points: number;
  createdAt: ISODateString;
}

export interface PauseLog {
  id: string;
  batchId: string;
  reasonCode: PauseReasonCode;
  reasonLabel: string | null;
  startedAt: ISODateString;
  /** Null while the pause is still running. */
  endedAt: ISODateString | null;
  durationSeconds: number | null;
}

export interface AppSetting {
  key: string;
  value: string;
  updatedAt: ISODateString;
}

/* -------------------------------------------------------------------------- */
/*  Aggregated / computed view models                                         */
/* -------------------------------------------------------------------------- */

export interface WorkerRef {
  workerId: string;
  fullName: string;
  employeeId: string;
  emoji: string;
}

export interface BatchMemberView extends WorkerRef {
  memberId: string;
  joinedAt: ISODateString;
  leftAt: ISODateString | null;
  isCurrentlyActive: boolean;
  /** Points this member earned on this batch (from the ledger). */
  points: number;
}

export interface PauseLogView {
  id: string;
  reasonCode: PauseReasonCode;
  reasonLabel: string | null;
  startedAt: ISODateString;
  endedAt: ISODateString | null;
  durationSeconds: number;
  isRunning: boolean;
}

/** Live, server-computed statistics for one batch. */
export interface BatchStats {
  elapsedSeconds: number;
  pausedSeconds: number;
  /** Elapsed minus pause time. */
  activeSeconds: number;
  isPaused: boolean;
  activePause: PauseLogView | null;
  palletCount: number;
  totalCartons: number;
  totalPoints: number;
  /** Points per active hour, computed live. */
  pointsPerHour: number;
}

export interface BatchView {
  batch: Batch;
  line: ProductionLine;
  product: Product;
  /**
   * Names of every race currently ACTIVE — i.e. every race this batch's next
   * pallet will contribute to. A batch feeds all of them at once.
   */
  activeRaceNames: string[];
  stats: BatchStats;
  members: BatchMemberView[];
  pauses: PauseLogView[];
  palletSizes: PalletSize[];
  recentPallets: PalletLog[];
}

/** One station card on the dashboard: a line and whatever it is running. */
export interface StationView {
  line: ProductionLine;
  batch: BatchView | null;
}

export interface LeaderboardRow {
  rank: number;
  worker: WorkerRef;
  /** Volume leaderboard: total accumulated points in the race. */
  points: number;
  /** Cartons this worker is credited with inside the race. */
  cartons: number;
  pallets: number;
  batches: number;
  activeSeconds: number;
  activeHours: number;
  /** Efficiency leaderboard: points per active hour. */
  pointsPerHour: number;
  /** Whether the worker cleared the race minimum-hours threshold. */
  qualified: boolean;
  /** Human readable reason when `qualified === false`. */
  disqualifiedReason: string | null;
}

export interface RaceLeaderboard {
  race: Race | null;
  generatedAt: ISODateString;
  minActiveHours: number;
  byVolume: LeaderboardRow[];
  byEfficiency: LeaderboardRow[];
  totals: {
    points: number;
    cartons: number;
    pallets: number;
    batches: number;
    activeSeconds: number;
    workers: number;
    qualifiedWorkers: number;
  };
}

/** Compact race descriptor for the leaderboard race selector. */
export interface RaceSummary {
  race: Race;
  points: number;
  cartons: number;
  pallets: number;
  batches: number;
  workers: number;
}

export interface PauseBreakdownRow {
  reasonCode: PauseReasonCode;
  reasonLabel: string | null;
  occurrences: number;
  totalSeconds: number;
  /** Share of total paused time, 0..1. */
  share: number;
}

export interface BatchHistoryRow {
  batch: Batch;
  line: ProductionLine | null;
  product: Product;
  /** Every race this batch contributed points to, by name. */
  raceNames: string[];
  startedAt: ISODateString;
  finishedAt: ISODateString | null;
  totalElapsedSeconds: number;
  activeSeconds: number;
  pausedSeconds: number;
  palletCount: number;
  totalCartons: number;
  totalPoints: number;
  members: WorkerRef[];
  pauseBreakdown: PauseBreakdownRow[];
  /** Local date key (YYYY-MM-DD) used for grouping in the ledger. */
  dateKey: string;
}

export interface DowntimeReportRow {
  reasonCode: PauseReasonCode;
  reasonLabel: string | null;
  occurrences: number;
  totalSeconds: number;
  averageSeconds: number;
  affectedBatches: number;
}

export interface WorkerSummaryReportRow {
  worker: WorkerRef;
  races: number;
  batches: number;
  pallets: number;
  cartons: number;
  points: number;
  activeSeconds: number;
  activeHours: number;
  pointsPerHour: number;
  pauseSeconds: number;
}

/* -------------------------------------------------------------------------- */
/*  Daily statistics                                                          */
/* -------------------------------------------------------------------------- */

export interface DailyProductStats {
  productId: string;
  productName: string;
  sizeLabel: string;
  /** The headline figure on the daily screen: pallets produced today. */
  pallets: number;
  cartons: number;
  points: number;
  /** Pallets as a share of the day's total, 0..1 — drives the bar widths. */
  share: number;
}

export interface DailyLineStats {
  lineId: string;
  lineName: string;
  lineCode: string;
  pallets: number;
  cartons: number;
  points: number;
  activeSeconds: number;
  pausedSeconds: number;
  batches: number;
  batchesRunning: number;
}

export interface DailyHourStats {
  /** Local hour of day, 0-23. */
  hour: number;
  pallets: number;
  cartons: number;
}

export interface DailyWorkerStats {
  worker: WorkerRef;
  points: number;
  pallets: number;
  cartons: number;
  activeSeconds: number;
}

export interface DailyStats {
  dateKey: string;
  generatedAt: ISODateString;
  totals: {
    pallets: number;
    cartons: number;
    points: number;
    batches: number;
    batchesCompleted: number;
    batchesRunning: number;
    activeSeconds: number;
    pausedSeconds: number;
    workersOnFloor: number;
  };
  /** Sorted by pallet count, descending — the primary daily ranking. */
  byProduct: DailyProductStats[];
  byLine: DailyLineStats[];
  byHour: DailyHourStats[];
  topWorkers: DailyWorkerStats[];
}

/** Full dashboard payload returned by `GET /api/state`. */
export interface StationState {
  generatedAt: ISODateString;
  /** One entry per active line, in the supervisor's configured order. */
  stations: StationView[];
  productionLines: ProductionLine[];
  workers: Worker[];
  products: Product[];
  palletSizesByProduct: Record<string, PalletSize[]>;
  /** The primary race — the one new pallets are attributed to. */
  activeRace: Race | null;
  /** Every race currently open. There may be more than one. */
  activeRaces: Race[];
  leaderboard: RaceLeaderboard;
  /** Idle timeout in seconds before TV Mode engages. */
  idleSeconds: number;
  /** Seconds each TV Mode panel is shown. */
  tvSlideSeconds: number;
  /** Which panels the TV Mode rotation includes, in display order. */
  tvPanels: TvPanelKey[];
  todayTotals: {
    points: number;
    cartons: number;
    pallets: number;
    batchesCompleted: number;
    activeSeconds: number;
    pausedSeconds: number;
  };
}
