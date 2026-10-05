import { jsonOk, route } from '@/lib/api/handler';
import { resumeBatch } from '@/lib/services/batches';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/batches/:id/resume`
 *
 * Closes the open pause and banks its duration. Fails with `batch_not_paused`
 * when there is nothing to resume.
 */
export const POST = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  return jsonOk({ batch: await resumeBatch(id) });
});
