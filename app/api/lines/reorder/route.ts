import { jsonOk, readJson, route } from '@/lib/api/handler';
import { lineReorderSchema } from '@/lib/api/schemas';
import { reorderLines } from '@/lib/services/lines';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/lines/reorder`
 *
 * Persists the dashboard display order. The station screen renders one card per
 * active line in exactly this order, so a supervisor can put the busiest line
 * first.
 */
export const POST = route(async (request: Request) => {
  const { ids } = await readJson(request, lineReorderSchema);
  return jsonOk({ lines: await reorderLines(ids) });
});
