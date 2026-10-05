import { jsonOk, route } from '@/lib/api/handler';
import { cancelBatch, getBatchView } from '@/lib/services/batches';

export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

/** `GET /api/batches/:id` — full view model for one batch. */
export const GET = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  return jsonOk({ batch: await getBatchView(id) });
});

/**
 * `DELETE /api/batches/:id` — cancels a running batch.
 *
 * Discards the batch and everything attached to it (members, pallets, point
 * awards, pauses). Intended for "we opened the wrong line" recovery, not for
 * normal operation — use `POST /finish` to keep the record.
 */
export const DELETE = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  await cancelBatch(id);
  return jsonOk({ cancelled: true });
});
