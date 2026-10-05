import { jsonOk, readJson, route } from '@/lib/api/handler';
import { workerUpdateSchema } from '@/lib/api/schemas';
import { deleteWorker, getWorker, updateWorker } from '@/lib/services/workers';
import { Errors } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

/** `GET /api/workers/:id` */
export const GET = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  return jsonOk({ worker: await getWorker(id) });
});

/** `PATCH /api/workers/:id` */
export const PATCH = route(async (request: Request, context: Context) => {
  const { id } = await context.params;
  const input = await readJson(request, workerUpdateSchema);
  return jsonOk({ worker: await updateWorker(id, input) });
});

/**
 * `DELETE /api/workers/:id`
 *
 * Deletes the worker, or deactivates them when production history exists.
 * The response reports which happened so the UI can explain it in Hebrew.
 */
export const DELETE = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  if (!id) throw Errors.notFound('worker');
  const result = await deleteWorker(id);
  return jsonOk(result);
});
