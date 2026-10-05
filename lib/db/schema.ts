import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { BatchStatus, PauseReasonCode, RaceStatus } from '@/lib/domain/types';

/* -------------------------------------------------------------------------- */
/*  workers                                                                   */
/* -------------------------------------------------------------------------- */

export const workers = pgTable(
  'workers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    employeeId: text('employee_id').notNull(),
    /** Unique profile emoji. Hard-enforced by a unique index below. */
    emoji: text('emoji').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdUnique: uniqueIndex('workers_employee_id_unique').on(table.employeeId),
    emojiUnique: uniqueIndex('workers_emoji_unique').on(table.emoji),
    activeIdx: index('workers_is_active_idx').on(table.isActive),
  }),
);

/* -------------------------------------------------------------------------- */
/*  production lines                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Physical filling / packaging lines. Fully dynamic — supervisors create,
 * rename, reorder and retire them from the admin console, and the station
 * dashboard renders one live card per active line.
 */
export const productionLines = pgTable(
  'production_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Short badge, e.g. "A". Unique so CSV exports stay unambiguous. */
    code: text('code').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex('production_lines_code_unique').on(table.code),
    sortIdx: index('production_lines_sort_idx').on(table.sortOrder),
    activeIdx: index('production_lines_is_active_idx').on(table.isActive),
  }),
);

/* -------------------------------------------------------------------------- */
/*  products & pallet sizes                                                   */
/* -------------------------------------------------------------------------- */

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    sku: text('sku'),
    sizeLabel: text('size_label').notNull(),
    cartonsPerLayout: integer('cartons_per_layout').notNull().default(12),
    /** Points per carton — the per-SKU complexity multiplier. */
    pointValue: doublePrecision('point_value').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index('products_name_idx').on(table.name),
    activeIdx: index('products_is_active_idx').on(table.isActive),
  }),
);

export const palletSizes = pgTable(
  'pallet_sizes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    cartons: integer('cartons').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => ({
    productIdx: index('pallet_sizes_product_idx').on(table.productId),
    productCartonsUnique: uniqueIndex('pallet_sizes_product_cartons_unique').on(
      table.productId,
      table.cartons,
    ),
  }),
);

/* -------------------------------------------------------------------------- */
/*  races                                                                     */
/* -------------------------------------------------------------------------- */

export const races = pgTable(
  'races',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    prizeDescription: text('prize_description'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull().defaultNow(),
    endAt: timestamp('end_at', { withTimezone: true }),
    minActiveHours: doublePrecision('min_active_hours').notNull().default(30),
    status: text('status').$type<RaceStatus>().notNull().default('ACTIVE'),
    /**
     * Exactly one ACTIVE race is primary. Several races may be active at once and
     * every one of them accumulates points from every running batch; "primary"
     * only decides which board is surfaced by default on the station sidebar,
     * the header and TV Mode.
     */
    isPrimary: boolean('is_primary').notNull().default(false),
    archiveNote: text('archive_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('races_status_idx').on(table.status),
    startIdx: index('races_start_at_idx').on(table.startAt),
    primaryIdx: index('races_is_primary_idx').on(table.isPrimary),
    endAtIdx: index('races_end_at_idx').on(table.endAt),
  }),
);

/**
 * Multiple races may run concurrently, but only one may be the primary — the
 * race that new pallets are attributed to.
 */
export const racesSinglePrimaryIndex = `
  CREATE UNIQUE INDEX IF NOT EXISTS races_single_primary_unique
  ON races (is_primary) WHERE is_primary = true AND status = 'ACTIVE';
`;

/**
 * Per-race point-multiplier overrides.
 *
 * The product carries its inherent complexity, but a race can weight a SKU
 * differently. These rows are what the "use as template" flow carries over, so
 * a recurring monthly race does not have to be rebuilt.
 */
export const raceProductPoints = pgTable(
  'race_product_points',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    raceId: uuid('race_id')
      .notNull()
      .references(() => races.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    pointValue: doublePrecision('point_value').notNull(),
  },
  (table) => ({
    raceIdx: index('race_product_points_race_idx').on(table.raceId),
    raceProductUnique: uniqueIndex('race_product_points_unique').on(table.raceId, table.productId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  batches                                                                   */
/* -------------------------------------------------------------------------- */

export const batches = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lineId: uuid('line_id')
      .notNull()
      .references(() => productionLines.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    totalElapsedSeconds: integer('total_elapsed_seconds'),
    activeSeconds: integer('active_seconds'),
    pausedSeconds: integer('paused_seconds'),
    totalCartons: integer('total_cartons'),
    totalPoints: doublePrecision('total_points'),
    status: text('status').$type<BatchStatus>().notNull().default('ACTIVE'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    lineIdx: index('batches_line_idx').on(table.lineId),
    productIdx: index('batches_product_idx').on(table.productId),
    statusIdx: index('batches_status_idx').on(table.status),
    startedIdx: index('batches_started_at_idx').on(table.startedAt),
    lineStatusIdx: index('batches_line_status_idx').on(table.lineId, table.status),
  }),
);

/** Only one ACTIVE batch per line at any moment. */
export const batchesSingleActivePerLineIndex = `
  CREATE UNIQUE INDEX IF NOT EXISTS batches_one_active_per_line_unique
  ON batches (line_id) WHERE status = 'ACTIVE';
`;

export const batchMembers = pgTable(
  'batch_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workers.id, { onDelete: 'restrict' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => ({
    batchIdx: index('batch_members_batch_idx').on(table.batchId),
    workerIdx: index('batch_members_worker_idx').on(table.workerId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  pallets, points, pauses                                                   */
/* -------------------------------------------------------------------------- */

export const palletLogs = pgTable(
  'pallet_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    palletSizeId: uuid('pallet_size_id').references(() => palletSizes.id, {
      onDelete: 'set null',
    }),
    cartons: integer('cartons').notNull(),
    /** The product's base multiplier at the moment of logging. */
    pointValue: doublePrecision('point_value').notNull(),
    /** `cartons × pointValue` at the base multiplier. */
    totalPoints: doublePrecision('total_points').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    batchIdx: index('pallet_logs_batch_idx').on(table.batchId),
    createdIdx: index('pallet_logs_created_at_idx').on(table.createdAt),
    productIdx: index('pallet_logs_product_idx').on(table.productId),
  }),
);

export const pointAwards = pgTable(
  'point_awards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    palletLogId: uuid('pallet_log_id')
      .notNull()
      .references(() => palletLogs.id, { onDelete: 'cascade' }),
    /**
     * The race this award belongs to. One pallet produces an award row for every
     * (worker × race that was ACTIVE at logging time), which is how a single
     * batch contributes to all concurrent races at once.
     *
     * `CASCADE` on delete: removing a race removes only its own ledger rows. No
     * other race, batch or pallet is affected, because attribution lives here and
     * nowhere else.
     */
    raceId: uuid('race_id')
      .notNull()
      .references(() => races.id, { onDelete: 'cascade' }),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workers.id, { onDelete: 'cascade' }),
    points: doublePrecision('points').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    batchIdx: index('point_awards_batch_idx').on(table.batchId),
    raceIdx: index('point_awards_race_idx').on(table.raceId),
    workerIdx: index('point_awards_worker_idx').on(table.workerId),
    palletIdx: index('point_awards_pallet_idx').on(table.palletLogId),
    createdIdx: index('point_awards_created_at_idx').on(table.createdAt),
    /** The hot path for a per-race leaderboard. */
    raceWorkerIdx: index('point_awards_race_worker_idx').on(table.raceId, table.workerId),
    racePalletIdx: index('point_awards_race_pallet_idx').on(table.raceId, table.palletLogId),
  }),
);

export const pauseLogs = pgTable(
  'pause_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    reasonCode: text('reason_code').$type<PauseReasonCode>().notNull(),
    reasonLabel: text('reason_label'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds'),
  },
  (table) => ({
    batchIdx: index('pause_logs_batch_idx').on(table.batchId),
    reasonIdx: index('pause_logs_reason_idx').on(table.reasonCode),
    startedIdx: index('pause_logs_started_at_idx').on(table.startedAt),
  }),
);

/** Only one running pause per batch. */
export const pauseLogsSingleOpenIndex = `
  CREATE UNIQUE INDEX IF NOT EXISTS pause_logs_one_open_per_batch_unique
  ON pause_logs (batch_id) WHERE ended_at IS NULL;
`;

/* -------------------------------------------------------------------------- */
/*  settings                                                                  */
/* -------------------------------------------------------------------------- */

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Settings keys recognised by the service layer. */
export const SETTING_KEYS = {
  MIN_RACE_HOURS: 'min_race_hours',
  TV_IDLE_SECONDS: 'tv_idle_seconds',
  /** How long each TV Mode panel stays on screen. */
  TV_SLIDE_SECONDS: 'tv_slide_seconds',
  /** Comma-separated list of TV Mode panel keys to include in the rotation. */
  TV_PANELS: 'tv_panels',
  FACTORY_NAME: 'factory_name',
} as const;
