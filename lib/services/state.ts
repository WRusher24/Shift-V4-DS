/**
 * Dashboard state assembly.
 *
 * One endpoint (`GET /api/state`) returns everything the station screen, the TV
 * mode and the mini leaderboard need, so a factory-floor client polls a single
 * URL instead of fanning out requests.
 *
 * It is also the boot entry point: it guarantees the demo dataset exists, at
 * least one production line is configured, and exactly one primary race is set —
 * so a fresh install is never in an unusable state.
 */

import type { StationState } from '@/lib/domain/types';
import { ensureSeeded } from '@/lib/bootstrap';
import { getDayTotals, getStationViews } from '@/lib/services/batches';
import { getRaceLeaderboard } from '@/lib/services/leaderboard';
import { ensureDefaultLines } from '@/lib/services/lines';
import { palletSizesByProduct, listProducts } from '@/lib/services/products';
import { ensurePrimaryRace, listActiveRaces, listRaces } from '@/lib/services/races';
import { getRuntimeSettings } from '@/lib/services/settings';
import { listWorkers } from '@/lib/services/workers';
import { getRepository } from '@/lib/repo';
import { endOfDay, startOfDay } from '@/lib/utils/id';

export async function getStationState(now = Date.now()): Promise<StationState> {
  // Populate the demo dataset on first boot when running without a database.
  await ensureSeeded();

  // A factory always has at least one line and one scoring target.
  await ensureDefaultLines();
  const activeRace = await ensurePrimaryRace();

  const [stations, productionLines, workers, products, sizesByProduct, activeRaces, leaderboard, todayTotals, runtime] =
    await Promise.all([
      getStationViews(now),
      getRepository().listProductionLines(),
      listWorkers(),
      listProducts(),
      palletSizesByProduct(),
      listActiveRaces(),
      getRaceLeaderboard(activeRace?.id, now),
      getDayTotals(startOfDay(new Date(now)), endOfDay(new Date(now))),
      getRuntimeSettings(),
    ]);

  return {
    generatedAt: new Date(now).toISOString(),
    stations,
    productionLines,
    workers,
    products,
    palletSizesByProduct: sizesByProduct,
    activeRace,
    activeRaces,
    leaderboard,
    idleSeconds: runtime.tvIdleSeconds,
    tvSlideSeconds: runtime.tvSlideSeconds,
    tvPanels: runtime.tvPanels,
    todayTotals,
  };
}

/**
 * A trimmed payload for the global TV overlay.
 *
 * TV Mode can engage on any page, so this endpoint must be cheap enough to poll
 * from a leaderboard or admin screen without dragging the full station payload
 * along.
 */
export async function getTvState(now = Date.now()): Promise<StationState> {
  // The TV board needs the same shape as the dashboard; the station views are
  // already assembled there, so reuse it rather than duplicating the logic.
  return getStationState(now);
}

/** Small diagnostics payload for `/api/health`. */
export async function getHealth(): Promise<{
  ok: boolean;
  storage: string;
  storageKind: 'drizzle' | 'local';
  counts: {
    workers: number;
    products: number;
    lines: number;
    activeBatches: number;
    races: number;
    activeRaces: number;
    archivedRaces: number;
  };
  time: string;
}> {
  await ensureSeeded();

  const repository = getRepository();

  const [workers, products, lines, activeBatches, races, activeRaces] = await Promise.all([
    repository.listWorkers(),
    repository.listProducts(),
    repository.listProductionLines(),
    repository.listActiveBatches(),
    listRaces(),
    listActiveRaces(),
  ]);

  return {
    ok: true,
    storage: repository.describe(),
    storageKind: repository.kind,
    counts: {
      workers: workers.length,
      products: products.length,
      lines: lines.length,
      activeBatches: activeBatches.length,
      races: races.length,
      activeRaces: activeRaces.length,
      archivedRaces: races.filter((race) => race.status === 'FINISHED').length,
    },
    time: new Date().toISOString(),
  };
}
