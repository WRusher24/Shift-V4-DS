import { jsonOk, readJson, route } from '@/lib/api/handler';
import { batchStartSchema } from '@/lib/api/schemas';
import { getStationViews, startBatch } from '@/lib/services/batches';
import { getStationState } from '@/lib/services/state';

export const dynamic = 'force-dynamic';

/** `GET /api/batches` — every active line with whatever it is running. */
export const GET = route(async () => jsonOk({ stations: await getStationViews() }));

/**
 * `POST /api/batches` — opens a batch on a line.
 *
 * Rejects with `line_busy` when the line already has an active batch.
 *
 * There is deliberately no race to choose. Every active batch contributes to
 * every race that is ACTIVE at the moment each pallet is logged, so starting a
 * batch is unaffected by race configuration and a race opened mid-shift starts
 * scoring on the very next pallet.
 */
export const POST = route(async (request: Request) => {
  const input = await readJson(request, batchStartSchema);
  const view = await startBatch({
    lineId: input.lineId,
    productId: input.productId,
    memberIds: input.memberIds,
    notes: input.notes ?? null,
  });
  return jsonOk({ batch: view, state: await getStationState() }, 201);
});
