-- ============================================================================
-- Shift — migration 0002
--
--   * Concurrent-race scoring. A batch is no longer tied to one race: when a
--     pallet is logged it is attributed to EVERY race that is ACTIVE at that
--     instant, producing one `point_awards` row per (worker x active race).
--     That is what makes "all active batches contribute to all active races
--     concurrently" work.
--
--   * Race attribution therefore lives **only** in `point_awards`. The
--     now-redundant `batches.race_id` and `pallet_logs.race_id` columns are
--     dropped, so there is exactly one source of truth.
--
--   * Deleting a race cascades to its own ledger rows only.
--
--   * The "use as template" lineage column is removed with the feature.
--
--   * TV Mode panel selection setting.
--
-- Existing data is preserved: every point award already carries its race id, so
-- the fan-out model reads historical rows exactly as before. No operational row
-- is deleted by this migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. point_awards.race_id -> ON DELETE CASCADE
--    Deleting a race removes its own ledger rows and nothing else.
-- ---------------------------------------------------------------------------
ALTER TABLE "point_awards" DROP CONSTRAINT IF EXISTS "point_awards_race_id_fkey";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'point_awards_race_id_fkey') THEN
    ALTER TABLE "point_awards"
      ADD CONSTRAINT "point_awards_race_id_fkey"
      FOREIGN KEY ("race_id") REFERENCES "races" ("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Supports "which pallets belong to this race" without scanning the whole table.
CREATE INDEX IF NOT EXISTS "point_awards_race_pallet_idx"
  ON "point_awards" ("race_id", "pallet_log_id");

-- ---------------------------------------------------------------------------
-- 2. Drop the redundant race attribution from batches and pallets
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "batches_race_idx";
DROP INDEX IF EXISTS "pallet_logs_race_idx";

ALTER TABLE "batches" DROP COLUMN IF EXISTS "race_id";
ALTER TABLE "pallet_logs" DROP COLUMN IF EXISTS "race_id";

-- ---------------------------------------------------------------------------
-- 3. Remove the race-template lineage column (feature withdrawn)
-- ---------------------------------------------------------------------------
ALTER TABLE "races" DROP CONSTRAINT IF EXISTS "races_template_of_fkey";
ALTER TABLE "races" DROP COLUMN IF EXISTS "template_of";

-- Index the end date: the auto-archiver looks for ACTIVE races past their end.
CREATE INDEX IF NOT EXISTS "races_end_at_idx" ON "races" ("end_at");

-- ---------------------------------------------------------------------------
-- 4. TV Mode panel selection
--    A comma-separated list of panel keys. An empty string means "none chosen";
--    a missing row means "use the default rotation".
-- ---------------------------------------------------------------------------
INSERT INTO "app_settings" ("key", "value")
VALUES ('tv_panels', 'leaderboard_volume,leaderboard_efficiency,active_batches,daily,race_stats')
ON CONFLICT ("key") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Reporting views, rebuilt against the ledger-only attribution
-- ---------------------------------------------------------------------------

-- Volume standings per worker, per race. Unchanged in shape, but now the only
-- place race attribution exists.
CREATE OR REPLACE VIEW "v_race_volume" AS
SELECT
  pa."race_id"                                       AS race_id,
  pa."worker_id"                                     AS worker_id,
  SUM(pa."points")                                   AS points,
  COUNT(DISTINCT pa."batch_id")                      AS batches,
  COUNT(DISTINCT pa."pallet_log_id")                 AS pallets
FROM "point_awards" pa
GROUP BY pa."race_id", pa."worker_id";

-- Pallets belonging to a race, resolved through the ledger.
CREATE OR REPLACE VIEW "v_race_pallets" AS
SELECT DISTINCT
  pa."race_id"                                       AS race_id,
  pl."id"                                            AS pallet_log_id,
  pl."batch_id"                                      AS batch_id,
  pl."product_id"                                    AS product_id,
  pl."cartons"                                       AS cartons,
  pl."created_at"                                    AS created_at
FROM "point_awards" pa
JOIN "pallet_logs" pl ON pl."id" = pa."pallet_log_id";

-- Daily production per product — unaffected by race attribution.
CREATE OR REPLACE VIEW "v_daily_product_pallets" AS
SELECT
  (pl."created_at" AT TIME ZONE 'UTC')::date          AS production_date,
  pl."product_id"                                     AS product_id,
  COUNT(*)                                            AS pallets,
  SUM(pl."cartons")                                   AS cartons,
  SUM(pl."total_points")                              AS points
FROM "pallet_logs" pl
GROUP BY (pl."created_at" AT TIME ZONE 'UTC')::date, pl."product_id";

-- Downtime grouped by reason.
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
-- End of migration 0002
-- ============================================================================
