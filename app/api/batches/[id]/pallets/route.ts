import { jsonOk, readJson, route } from '@/lib/api/handler';
import { palletCreateSchema } from '@/lib/api/schemas';
import { addPallet, removeLastPallet } from '@/lib/services/batches';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/batches/:id/pallets`
 *
 * Logs a pallet and instantly attributes its points.
 *
 *   palletPoints = cartons x product.pointValue
 *   each member active at this instant receives palletPoints / memberCount
 *
 * The response includes the exact per-member split so the floor screen can show
 * "28 cartons = 42 points, 4 members x 10.5 points each".
 */
export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const input = await readJson(request, palletCreateSchema);

  const result = await addPallet(id, {
    palletSizeId: input.palletSizeId ?? null,
    cartons: input.cartons ?? null,
    note: input.note ?? null,
  });

  return jsonOk(
    {
      pallet: result.pallet,
      /**
       * Every race this pallet scored in, with the points it contributed to
       * each. One entry per race that was ACTIVE at the moment of logging.
       */
      races: result.races,
      memberIds: result.memberIds,
      /** The pallet's value at the product's base multiplier. */
      totalPoints: result.totalPoints,
      perMemberPoints: result.perMemberPoints,
      batch: result.view,
    },
    201,
  );
});

/** `DELETE /api/batches/:id/pallets` — undo the most recent pallet. */
export const DELETE = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  return jsonOk({ batch: await removeLastPallet(id) });
});
