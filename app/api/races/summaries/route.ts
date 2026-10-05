import { jsonOk, route } from '@/lib/api/handler';
import { getRaceSummaries } from '@/lib/services/races';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * `GET /api/races/summaries`
 *
 * One row per race — active and archived — with its point, pallet, carton,
 * batch and worker totals. Feeds the leaderboard race selector, which lets a
 * supervisor look back at any historical race without losing the live board.
 */
export const GET = route(async () => jsonOk({ summaries: await getRaceSummaries() }));
