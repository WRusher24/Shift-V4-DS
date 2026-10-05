import { jsonOk, readJson, route } from '@/lib/api/handler';
import { raceUpdateSchema } from '@/lib/api/schemas';
import { deleteRace, getRace, updateRace } from '@/lib/services/races';

export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

/** `GET /api/races/:id` */
export const GET = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  return jsonOk({ race: await getRace(id) });
});

/**
 * `PATCH /api/races/:id` — rename, change the window, edit the threshold, or set
 * per-product point multipliers.
 *
 * Setting an end date that is already in the past archives the race immediately,
 * because the auto-archiver runs at the end of the update.
 */
export const PATCH = route(async (request: Request, context: Context) => {
  const { id } = await context.params;
  const input = await readJson(request, raceUpdateSchema);
  return jsonOk({ race: await updateRace(id, input) });
});

/**
 * `DELETE /api/races/:id`
 *
 * **Destructive.** Removes the race together with every point award scored in it
 * — `point_awards.race_id` cascades. No other race, batch or pallet is affected,
 * because race attribution lives only in the award rows.
 *
 * The response reports how many awards were destroyed, and the UI is expected to
 * have confirmed the loss first (see `GET /api/races/:id/impact`). Archiving via
 * `POST /api/races/:id/finish` is the non-destructive alternative.
 */
export const DELETE = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  return jsonOk(await deleteRace(id));
});
