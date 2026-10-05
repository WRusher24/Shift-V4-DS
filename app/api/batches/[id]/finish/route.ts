import { jsonOk, readJson, route } from '@/lib/api/handler';
import { batchFinishSchema } from '@/lib/api/schemas';
import { finishBatch } from '@/lib/services/batches';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/batches/:id/finish`
 *
 * Closes the batch, closes any open pause, and writes an immutable snapshot of
 * elapsed / active / paused time plus total cartons and points.
 */
export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const body = await readJson(request, batchFinishSchema);
  const result = await finishBatch(id, { notes: body?.notes ?? null });
  return jsonOk({
    batch: result.batch,
    stats: result.stats,
    pauseCount: result.pauses.length,
    palletCount: result.pallets.length,
    memberCount: result.members.length,
  });
});
