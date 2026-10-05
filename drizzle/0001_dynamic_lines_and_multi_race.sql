-- ============================================================================
-- Shift — migration 0001
--   * dynamic production lines (replacing the fixed LINE_A / LINE_B enum)
--   * multiple concurrent races with a single "primary" race
--   * per-race product point-multiplier overrides (the race template payload)
--   * race attribution denormalised onto every pallet and point award, so a
--     race reset takes effect mid-batch without restarting the batch
--   * TV Mode slide duration setting
--
-- The script is written to be re-runnable and to upgrade an existing database
-- that already holds production data. It never deletes operational rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. production_lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "production_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "code" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "production_lines_code_unique" ON "production_lines" ("code");
CREATE INDEX IF NOT EXISTS "production_lines_sort_idx" ON "production_lines" ("sort_order");
CREATE INDEX IF NOT EXISTS "production_lines_is_active_idx" ON "production_lines" ("is_active");

-- Carry over the two lines the previous schema hard-coded.
INSERT INTO "production_lines" ("name", "code", "sort_order", "is_active")
SELECT 'קו A', 'LINE_A', 0, true
WHERE NOT EXISTS (SELECT 1 FROM "production_lines" WHERE "code" = 'LINE_A');

INSERT INTO "production_lines" ("name", "code", "sort_order", "is_active")
SELECT 'קו B', 'LINE_B', 1, true
WHERE NOT EXISTS (SELECT 1 FROM "production_lines" WHERE "code" = 'LINE_B');

-- ---------------------------------------------------------------------------
-- 2. batches.line_code -> batches.line_id
-- ---------------------------------------------------------------------------
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "line_id" uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'batches' AND column_name = 'line_code'
  ) THEN
    UPDATE "batches" b
       SET "line_id" = l."id"
      FROM "production_lines" l
     WHERE l."code" = b."line_code"
       AND b."line_id" IS NULL;

    -- Any line the enum knew about but the table did not: create it on the fly
    -- so the NOT NULL below can never fail on real data.
    INSERT INTO "production_lines" ("name", "code", "sort_order", "is_active")
    SELECT DISTINCT
           'קו ' || replace(b."line_code", 'LINE_', ''),
           b."line_code",
           100,
           true
      FROM "batches" b
     WHERE b."line_id" IS NULL
       AND NOT EXISTS (SELECT 1 FROM "production_lines" l WHERE l."code" = b."line_code");

    UPDATE "batches" b
       SET "line_id" = l."id"
      FROM "production_lines" l
     WHERE l."code" = b."line_code"
       AND b."line_id" IS NULL;

    -- Dropping the column also drops every index that referenced it, including
    -- batches_one_active_per_line_unique and batches_line_status_idx.
    ALTER TABLE "batches" DROP COLUMN "line_code";
  END IF;
END $$;

ALTER TABLE "batches" ALTER COLUMN "line_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_line_id_fkey') THEN
    ALTER TABLE "batches"
      ADD CONSTRAINT "batches_line_id_fkey"
      FOREIGN KEY ("line_id") REFERENCES "production_lines" ("id") ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "batches_line_idx" ON "batches" ("line_id");
CREATE INDEX IF NOT EXISTS "batches_line_status_idx" ON "batches" ("line_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "batches_one_active_per_line_unique"
  ON "batches" ("line_id") WHERE "status" = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 3. races: multiple active races, one primary, template lineage
-- ---------------------------------------------------------------------------
ALTER TABLE "races" ADD COLUMN IF NOT EXISTS "is_primary" boolean NOT NULL DEFAULT false;
ALTER TABLE "races" ADD COLUMN IF NOT EXISTS "template_of" uuid;
ALTER TABLE "races" ADD COLUMN IF NOT EXISTS "archive_note" text;

-- The old rule allowed only one ACTIVE race. That is no longer required.
DROP INDEX IF EXISTS "races_single_active_unique";

CREATE INDEX IF NOT EXISTS "races_is_primary_idx" ON "races" ("is_primary");

-- Promote the most recently started ACTIVE race to primary if none is set.
UPDATE "races"
   SET "is_primary" = true
 WHERE "status" = 'ACTIVE'
   AND NOT EXISTS (SELECT 1 FROM "races" r2 WHERE r2."is_primary" = true AND r2."status" = 'ACTIVE')
   AND "id" = (SELECT "id" FROM "races" WHERE "status" = 'ACTIVE' ORDER BY "start_at" DESC LIMIT 1);

CREATE UNIQUE INDEX IF NOT EXISTS "races_single_primary_unique"
  ON "races" ("is_primary") WHERE "is_primary" = true AND "status" = 'ACTIVE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'races_template_of_fkey') THEN
    ALTER TABLE "races"
      ADD CONSTRAINT "races_template_of_fkey"
      FOREIGN KEY ("template_of") REFERENCES "races" ("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. race_product_points — the payload carried over by "use as template"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "race_product_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "race_id" uuid NOT NULL REFERENCES "races" ("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products" ("id") ON DELETE CASCADE,
  "point_value" double precision NOT NULL,
  CONSTRAINT "race_product_points_value_check" CHECK ("point_value" > 0)
);

CREATE INDEX IF NOT EXISTS "race_product_points_race_idx" ON "race_product_points" ("race_id");
CREATE UNIQUE INDEX IF NOT EXISTS "race_product_points_unique"
  ON "race_product_points" ("race_id", "product_id");

-- ---------------------------------------------------------------------------
-- 5. Race attribution on pallets and point awards
-- ---------------------------------------------------------------------------
ALTER TABLE "pallet_logs" ADD COLUMN IF NOT EXISTS "race_id" uuid;

UPDATE "pallet_logs" p
   SET "race_id" = b."race_id"
  FROM "batches" b
 WHERE b."id" = p."batch_id"
   AND p."race_id" IS NULL;

ALTER TABLE "pallet_logs" ALTER COLUMN "race_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pallet_logs_race_id_fkey') THEN
    ALTER TABLE "pallet_logs"
      ADD CONSTRAINT "pallet_logs_race_id_fkey"
      FOREIGN KEY ("race_id") REFERENCES "races" ("id") ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "pallet_logs_race_idx" ON "pallet_logs" ("race_id");
CREATE INDEX IF NOT EXISTS "pallet_logs_product_idx" ON "pallet_logs" ("product_id");

ALTER TABLE "point_awards" ADD COLUMN IF NOT EXISTS "race_id" uuid;

UPDATE "point_awards" a
   SET "race_id" = b."race_id"
  FROM "batches" b
 WHERE b."id" = a."batch_id"
   AND a."race_id" IS NULL;

ALTER TABLE "point_awards" ALTER COLUMN "race_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'point_awards_race_id_fkey') THEN
    ALTER TABLE "point_awards"
      ADD CONSTRAINT "point_awards_race_id_fkey"
      FOREIGN KEY ("race_id") REFERENCES "races" ("id") ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "point_awards_race_idx" ON "point_awards" ("race_id");
-- The hot path for a per-race leaderboard.
CREATE INDEX IF NOT EXISTS "point_awards_race_worker_idx" ON "point_awards" ("race_id", "worker_id");

-- ---------------------------------------------------------------------------
-- 6. TV Mode slide duration
-- ---------------------------------------------------------------------------
INSERT INTO "app_settings" ("key", "value")
VALUES ('tv_slide_seconds', '8')
ON CONFLICT ("key") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Reporting views, rebuilt against the new race attribution
-- ---------------------------------------------------------------------------

-- Volume standings per worker, per race. Points now come straight from the
-- ledger's own race_id, so this is a single indexed aggregation.
CREATE OR REPLACE VIEW "v_race_volume" AS
SELECT
  pa."race_id"                                       AS race_id,
  pa."worker_id"                                     AS worker_id,
  SUM(pa."points")                                   AS points,
  COUNT(DISTINCT pa."batch_id")                      AS batches,
  COUNT(DISTINCT pa."pallet_log_id")                 AS pallets
FROM "point_awards" pa
GROUP BY pa."race_id", pa."worker_id";

-- Daily production per product — the primary ranking on the daily screen.
CREATE OR REPLACE VIEW "v_daily_product_pallets" AS
SELECT
  (pl."created_at" AT TIME ZONE 'UTC')::date          AS production_date,
  pl."product_id"                                     AS product_id,
  COUNT(*)                                            AS pallets,
  SUM(pl."cartons")                                   AS cartons,
  SUM(pl."total_points")                              AS points
FROM "pallet_logs" pl
GROUP BY (pl."created_at" AT TIME ZONE 'UTC')::date, pl."product_id";

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
-- End of migration 0001
-- ============================================================================
