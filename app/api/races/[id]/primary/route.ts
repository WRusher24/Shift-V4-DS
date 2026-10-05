import { jsonOk, route } from '@/lib/api/handler';
import { setPrimaryRace } from '@/lib/services/races';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/races/:id/primary`
 *
 * Makes this race the **default board to display**. Scoring is unaffected: every
 * active race already accumulates points from every running batch, so promoting a
 * race changes which leaderboard the station sidebar, the app header and TV Mode
 * surface — nothing else. No batch is touched and no production is lost.
 */
export const POST = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  return jsonOk(await setPrimaryRace(id));
});
