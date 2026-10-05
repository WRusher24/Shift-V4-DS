import { jsonOk, readJson, route, searchParams } from '@/lib/api/handler';
import { raceCreateSchema } from '@/lib/api/schemas';
import { getRaceSummaries, listRaces, startRace } from '@/lib/services/races';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/races?status=ACTIVE|FINISHED&summaries=true`
 *
 * Races past their configured end date are archived before the response is
 * built, so a caller can never observe a race in the wrong state.
 *
 * `summaries=true` adds per-race totals (points, pallets, cartons, batches,
 * workers) which the leaderboard race selector renders as a picker.
 */
export const GET = route(async (request: Request) => {
  const params = searchParams(request);
  const status = params.get('status');

  const races = await listRaces(status === 'ACTIVE' || status === 'FINISHED' ? { status } : undefined);

  if (params.get('summaries') === 'true') {
    return jsonOk({ races, summaries: await getRaceSummaries() });
  }

  return jsonOk({ races });
});

/**
 * `POST /api/races`
 *
 * Opens a new race. Nothing is closed and nothing is re-pointed: a race that is
 * already running simply stops being the display default if the new one takes
 * over, and it keeps scoring from every batch exactly like the new one.
 *
 * Every counter on the new race starts at zero because no point award carries
 * its id yet, and the very next pallet logged on any line contributes to it —
 * which is what makes a mid-shift race reset completely transparent to the crew.
 *
 * `isPrimary: false` opens a race purely for the archive, without changing the
 * default board. `productPoints` sets per-race multipliers at creation time.
 */
export const POST = route(async (request: Request) => {
  const input = await readJson(request, raceCreateSchema);
  const race = await startRace(input);
  return jsonOk({ race }, 201);
});
