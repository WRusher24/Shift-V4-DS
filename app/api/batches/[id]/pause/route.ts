import { jsonOk, readJson, route } from '@/lib/api/handler';
import { batchPauseSchema } from '@/lib/api/schemas';
import { pauseBatch } from '@/lib/services/batches';
import type { PauseReasonCode } from '@/lib/domain/types';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/batches/:id/pause`
 *
 * Records downtime. Pause time is tracked completely separately from active
 * working time, so a long stoppage never inflates the efficiency metric.
 */
export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const input = await readJson(request, batchPauseSchema);
  const view = await pauseBatch(id, {
    reasonCode: input.reasonCode as PauseReasonCode,
    note: input.note ?? null,
  });
  return jsonOk({ batch: view });
});
