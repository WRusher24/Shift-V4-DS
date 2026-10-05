import { jsonOk, readJson, route } from '@/lib/api/handler';
import { batchMemberAddSchema } from '@/lib/api/schemas';
import { addBatchMember, removeBatchMember } from '@/lib/services/batches';
import { Errors } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/batches/:id/members` — a worker joins a running batch.
 *
 * Points already awarded are untouched; the new member starts earning from the
 * next pallet onwards.
 */
export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const input = await readJson(request, batchMemberAddSchema);
  return jsonOk({ batch: await addBatchMember(id, input.workerId) });
});

/**
 * `DELETE /api/batches/:id/members?workerId=...`
 *
 * A worker leaves. Their membership interval is closed, so every subsequent
 * pallet is split strictly among the remaining active members, while points
 * they already earned stay on their ledger.
 */
export const DELETE = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const workerId = new URL(request.url).searchParams.get('workerId');
  if (!workerId) throw Errors.validation('חסר מזהה עובד.');

  return jsonOk({ batch: await removeBatchMember(id, workerId) });
});
