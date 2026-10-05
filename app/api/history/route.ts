import { jsonOk, route, searchParams } from '@/lib/api/handler';
import { getHistory } from '@/lib/services/reports';
import { endOfDay, startOfDay, addDays } from '@/lib/utils/id';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/history?from&to&productId&workerId&raceId&status&limit`
 *
 * Defaults to the last 14 days of completed batches. Returns the ledger rows
 * together with the lookup lists the filter bar needs.
 */
export const GET = route(async (request: Request) => {
  const params = searchParams(request);

  const to = params.get('to') ? new Date(params.get('to') as string) : endOfDay();
  const from = params.get('from')
    ? new Date(params.get('from') as string)
    : startOfDay(addDays(to, -14));

  const bundle = await getHistory({
    from: startOfDay(from).toISOString(),
    to: endOfDay(to).toISOString(),
    productId: params.get('productId') ?? undefined,
    workerId: params.get('workerId') ?? undefined,
    raceId: params.get('raceId') ?? undefined,
    lineId: params.get('lineId') ?? undefined,
    ...(params.get('status') === 'ACTIVE' || params.get('status') === 'COMPLETED'
      ? { status: params.get('status') as 'ACTIVE' | 'COMPLETED' }
      : {}),
    limit: params.get('limit') ? Number(params.get('limit')) : 500,
  });

  return jsonOk(bundle);
});
