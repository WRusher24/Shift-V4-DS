import { jsonOk, route, searchParams } from '@/lib/api/handler';
import { getRaceLeaderboard } from '@/lib/services/leaderboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * `GET /api/leaderboard?raceId=...`
 *
 * Returns both rankings (Volume and Efficiency) plus the race metadata and the
 * minimum-hours threshold that determines prize eligibility.
 */
export const GET = route(async (request: Request) => {
  const raceId = searchParams(request).get('raceId') ?? undefined;
  return jsonOk(await getRaceLeaderboard(raceId));
});
