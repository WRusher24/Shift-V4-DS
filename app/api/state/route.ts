import { jsonOk, route } from '@/lib/api/handler';
import { getStationState } from '@/lib/services/state';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * `GET /api/state`
 *
 * The single polling endpoint for the station dashboard and TV mode. Returns
 * both lines, the crew roster, the product catalogue, the active race and the
 * live leaderboards in one payload.
 */
export const GET = route(async () => jsonOk(await getStationState()));
