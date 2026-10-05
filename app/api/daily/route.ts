import { jsonOk, route, searchParams } from '@/lib/api/handler';
import { getDailyStats } from '@/lib/services/daily';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * `GET /api/daily?date=YYYY-MM-DD`
 *
 * The daily production picture, pallet-first: totals, per-product breakdown,
 * per-line breakdown, the hour-by-hour curve and the day's top workers.
 *
 * Defaults to today when `date` is omitted.
 */
export const GET = route(async (request: Request) => {
  const raw = searchParams(request).get('date');
  const date = raw ? new Date(raw) : new Date();

  if (Number.isNaN(date.getTime())) {
    return jsonOk({ error: 'invalid_date' }, 422);
  }

  return jsonOk(await getDailyStats(date));
});
