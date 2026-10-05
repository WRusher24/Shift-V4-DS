import { jsonOk, readJson, route } from '@/lib/api/handler';
import { lineUpdateSchema } from '@/lib/api/schemas';
import { deleteLine, getLine, updateLine } from '@/lib/services/lines';
import { Errors } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

/** `GET /api/lines/:id` */
export const GET = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  return jsonOk({ line: await getLine(id) });
});

/** `PATCH /api/lines/:id` — rename, re-code, reorder or activate/deactivate. */
export const PATCH = route(async (request: Request, context: Context) => {
  const { id } = await context.params;
  const input = await readJson(request, lineUpdateSchema);
  return jsonOk({ line: await updateLine(id, input) });
});

/**
 * `DELETE /api/lines/:id`
 *
 * Deletes the line, or deactivates it when it already has batch history. A line
 * that is currently running a batch is refused with `line_running` — finish or
 * cancel the batch first, otherwise the ledger would be left with an orphaned
 * running shift.
 */
export const DELETE = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  if (!id) throw Errors.notFound('production_line');
  return jsonOk(await deleteLine(id));
});
