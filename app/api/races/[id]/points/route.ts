import { jsonOk, readJson, route } from '@/lib/api/handler';
import { racePointOverridesSchema } from '@/lib/api/schemas';
import { listRaceProductPoints, setRaceProductPoints } from '@/lib/services/races';

export const dynamic = 'force-dynamic';

/** `GET /api/races/:id/points` — the per-product multipliers for this race. */
export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  return jsonOk({ productPoints: await listRaceProductPoints(id) });
});

/**
 * `PUT /api/races/:id/points`
 *
 * Replaces the whole override set for a race. A product omitted from the payload
 * falls back to its own default multiplier. Pallets already logged keep the
 * multiplier they were stamped with, so history is never rewritten.
 */
export const PUT = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { productPoints } = await readJson(request, racePointOverridesSchema);
  return jsonOk({ productPoints: await setRaceProductPoints(id, productPoints) });
});
