import { jsonOk, readJson, route } from '@/lib/api/handler';
import { raceFinishSchema } from '@/lib/api/schemas';
import { finishRace } from '@/lib/services/races';
import { getRaceLeaderboard } from '@/lib/services/leaderboard';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/races/:id/finish`
 *
 * Closes the race and moves it to the archive — the non-destructive counterpart
 * to `DELETE /api/races/:id`.
 *
 * Nothing is deleted: the race keeps its ledger rows and its standings remain
 * viewable under the archive filter indefinitely. If it was the default board,
 * the newest remaining active race is promoted so the station, the header and TV
 * Mode keep working.
 *
 * The final standings are captured *before* the race is closed and returned with
 * the response, so a caller can present the outcome without a second request.
 */
export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const body = await readJson(request, raceFinishSchema);

  const finalStandings = await getRaceLeaderboard(id);

  const archived = await finishRace(id, {
    endAt: body?.endAt || undefined,
    archiveNote: body?.archiveNote ?? null,
  });

  return jsonOk({ archived, finalStandings });
});
