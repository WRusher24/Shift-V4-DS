-- ============================================================================
-- Shift (شيفت) — initial schema
-- ----------------------------------------------------------------------------
-- Target: Neon PostgreSQL 15+
--
-- Design notes
--   * Points live in an immutable ledger (`point_awards`). Every award is tied
--     to a pallet, and every pallet to a batch, and every batch to a race.
--     Ending a race therefore never deletes anything: a new race simply starts
--     a fresh scope, which is what "points reset to 0" actually means here.
--   * Timestamps are `timestamptz` so a factory that spans time zones (or a
--     serverless function running in UTC) can never shift a shift boundary.
--   * Uniqueness rules are enforced in the database, not only in the service
--     layer: worker emoji, employee id, one active batch per line, one active
--     race, and one open pause per batch.
--   * Free-text columns (names, products, notes) are plain `text` with no
--     collation constraint, so Hebrew, Arabic and English all store natively.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- workers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "workers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "full_name" text NOT NULL,
  "employee_id" text NOT NULL,
  "emoji" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "workers_employee_id_unique" ON "workers" ("employee_id");
-- Hard guarantee of the "unique profile emoji" product rule.
CREATE UNIQUE INDEX IF NOT EXISTS "workers_emoji_unique" ON "workers" ("emoji");
CREATE INDEX IF NOT EXISTS "workers_is_active_idx" ON "workers" ("is_active");

-- ---------------------------------------------------------------------------
-- products & pallet sizes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "sku" text,
  "size_label" text NOT NULL,
  "cartons_per_layout" integer NOT NULL DEFAULT 12,
  "point_value" double precision NOT NULL DEFAULT 1,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "products_name_idx" ON "products" ("name");
CREATE INDEX IF NOT EXISTS "products_is_active_idx" ON "products" ("is_active");

CREATE TABLE IF NOT EXISTS "pallet_sizes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "cartons" integer NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "pallet_sizes_product_idx" ON "pallet_sizes" ("product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pallet_sizes_product_cartons_unique"
  ON "pallet_sizes" ("product_id", "cartons");

-- ---------------------------------------------------------------------------
-- races
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "races" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "prize_description" text,
  "start_at" timestamptz NOT NULL DEFAULT now(),
  "end_at" timestamptz,
  "min_active_hours" double precision NOT NULL DEFAULT 30,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "races_status_check" CHECK ("status" IN ('ACTIVE', 'FINISHED')),
  CONSTRAINT "races_window_check" CHECK ("end_at" IS NULL OR "end_at" >= "start_at")
);

CREATE INDEX IF NOT EXISTS "races_status_idx" ON "races" ("status");
CREATE INDEX IF NOT EXISTS "races_start_at_idx" ON "races" ("start_at");

-- At most one ACTIVE race at any time.
CREATE UNIQUE INDEX IF NOT EXISTS "races_single_active_unique"
  ON "races" ("status") WHERE "status" = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- batches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "line_code" text NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products" ("id") ON DELETE RESTRICT,
  "race_id" uuid NOT NULL REFERENCES "races" ("id") ON DELETE RESTRICT,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "total_elapsed_seconds" integer,
  "active_seconds" integer,
  "paused_seconds" integer,
  "total_cartons" integer,
  "total_points" double precision,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "batches_line_check" CHECK ("line_code" IN ('LINE_A', 'LINE_B')),
  CONSTRAINT "batches_status_check" CHECK ("status" IN ('ACTIVE', 'COMPLETED')),
  CONSTRAINT "batches_finish_check" CHECK (
    ("status" = 'ACTIVE' AND "finished_at" IS NULL)
    OR ("status" = 'COMPLETED' AND "finished_at" IS NOT NULL)
  ),
  CONSTRAINT "batches_non_negative_check" CHECK (
    COALESCE("total_elapsed_seconds", 0) >= 0
    AND COALESCE("active_seconds", 0) >= 0
    AND COALESCE("paused_seconds", 0) >= 0
    AND COALESCE("total_cartons", 0) >= 0
  )
);

CREATE INDEX IF NOT EXISTS "batches_race_idx" ON "batches" ("race_id");
CREATE INDEX IF NOT EXISTS "batches_product_idx" ON "batches" ("product_id");
CREATE INDEX IF NOT EXISTS "batches_status_idx" ON "batches" ("status");
CREATE INDEX IF NOT EXISTS "batches_started_at_idx" ON "batches" ("started_at");
CREATE INDEX IF NOT EXISTS "batches_line_status_idx" ON "batches" ("line_code", "status");

-- One running batch per line — the core multi-line constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "batches_one_active_per_line_unique"
  ON "batches" ("line_code") WHERE "status" = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- batch members (attendance intervals)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "batch_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL REFERENCES "batches" ("id") ON DELETE CASCADE,
  "worker_id" uuid NOT NULL REFERENCES "workers" ("id") ON DELETE RESTRICT,
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  "left_at" timestamptz,
  CONSTRAINT "batch_members_interval_check" CHECK ("left_at" IS NULL OR "left_at" >= "joined_at")
);

CREATE INDEX IF NOT EXISTS "batch_members_batch_idx" ON "batch_members" ("batch_id");
CREATE INDEX IF NOT EXISTS "batch_members_worker_idx" ON "batch_members" ("worker_id");

-- ---------------------------------------------------------------------------
-- pallet logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pallet_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL REFERENCES "batches" ("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products" ("id") ON DELETE RESTRICT,
  "pallet_size_id" uuid REFERENCES "pallet_sizes" ("id") ON DELETE SET NULL,
  "cartons" integer NOT NULL,
  "point_value" double precision NOT NULL,
  "total_points" double precision NOT NULL,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pallet_logs_cartons_check" CHECK ("cartons" > 0),
  CONSTRAINT "pallet_logs_points_check" CHECK ("total_points" >= 0)
);

CREATE INDEX IF NOT EXISTS "pallet_logs_batch_idx" ON "pallet_logs" ("batch_id");
CREATE INDEX IF NOT EXISTS "pallet_logs_created_at_idx" ON "pallet_logs" ("created_at");

-- ---------------------------------------------------------------------------
-- point awards (immutable ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "point_awards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL REFERENCES "batches" ("id") ON DELETE CASCADE,
  "pallet_log_id" uuid NOT NULL REFERENCES "pallet_logs" ("id") ON DELETE CASCADE,
  "worker_id" uuid NOT NULL REFERENCES "workers" ("id") ON DELETE CASCADE,
  "points" double precision NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "point_awards_points_check" CHECK ("points" >= 0)
);

CREATE INDEX IF NOT EXISTS "point_awards_batch_idx" ON "point_awards" ("batch_id");
CREATE INDEX IF NOT EXISTS "point_awards_worker_idx" ON "point_awards" ("worker_id");
CREATE INDEX IF NOT EXISTS "point_awards_pallet_idx" ON "point_awards" ("pallet_log_id");
CREATE INDEX IF NOT EXISTS "point_awards_created_at_idx" ON "point_awards" ("created_at");

-- The hot query for the Volume leaderboard: points per worker inside a race.
CREATE INDEX IF NOT EXISTS "point_awards_worker_batch_idx" ON "point_awards" ("worker_id", "batch_id");

-- ---------------------------------------------------------------------------
-- pause logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pause_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL REFERENCES "batches" ("id") ON DELETE CASCADE,
  "reason_code" text NOT NULL,
  "reason_label" text,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz,
  "duration_seconds" integer,
  CONSTRAINT "pause_logs_reason_check" CHECK (
    "reason_code" IN (
      'BOTTLE_MATERIAL_SHORTAGE',
      'MACHINE_MAINTENANCE',
      'CHANGEOVER_CLEANING',
      'WORKER_BREAK',
      'QUALITY_HOLD',
      'OTHER'
    )
  ),
  CONSTRAINT "pause_logs_interval_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);

CREATE INDEX IF NOT EXISTS "pause_logs_batch_idx" ON "pause_logs" ("batch_id");
CREATE INDEX IF NOT EXISTS "pause_logs_reason_idx" ON "pause_logs" ("reason_code");
CREATE INDEX IF NOT EXISTS "pause_logs_started_at_idx" ON "pause_logs" ("started_at");

-- A batch can never have two pauses running at once.
CREATE UNIQUE INDEX IF NOT EXISTS "pause_logs_one_open_per_batch_unique"
  ON "pause_logs" ("batch_id") WHERE "ended_at" IS NULL;

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Reporting views
-- ---------------------------------------------------------------------------

-- Volume standings per worker, per race. Points come straight from the ledger.
CREATE OR REPLACE VIEW "v_race_volume" AS
SELECT
  b."race_id"                                        AS race_id,
  pa."worker_id"                                     AS worker_id,
  SUM(pa."points")                                   AS points,
  COUNT(DISTINCT b."id")                             AS batches,
  COUNT(DISTINCT pa."pallet_log_id")                 AS pallets
FROM "point_awards" pa
JOIN "batches" b ON b."id" = pa."batch_id"
GROUP BY b."race_id", pa."worker_id";

-- Downtime grouped by reason, for the maintenance / payroll review.
CREATE OR REPLACE VIEW "v_downtime_by_reason" AS
SELECT
  p."reason_code"                                     AS reason_code,
  COUNT(*)                                            AS occurrences,
  COALESCE(SUM(
    COALESCE(
      p."duration_seconds",
      GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(p."ended_at", now()) - p."started_at"))::int)
    )
  ), 0)                                               AS total_seconds,
  COUNT(DISTINCT p."batch_id")                        AS affected_batches
FROM "pause_logs" p
GROUP BY p."reason_code";

-- ============================================================================
-- End of initial migration
-- ============================================================================
