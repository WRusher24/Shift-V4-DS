import { jsonOk, route } from '@/lib/api/handler';
import { getRaceImpact } from '@/lib/services/races';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/races/:id/impact`
 *
 * How much ledger data a race holds: award rows, distinct pallets, workers,
 * batches and total points.
 *
 * This exists so the delete confirmation can state exactly what will be
 * destroyed, rather than asking the operator to trust a generic warning. It is
 * also the honest way to offer a destructive action at all.
 */
export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  return jsonOk(await getRaceImpact(id));
});
