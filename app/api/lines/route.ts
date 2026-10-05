import { jsonOk, readJson, route, searchParams } from '@/lib/api/handler';
import { lineCreateSchema } from '@/lib/api/schemas';
import { createLine, listLines } from '@/lib/services/lines';
import { getRepository } from '@/lib/repo';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/lines?includeInactive=true`
 *
 * Returns the configured production lines together with a `running` flag per
 * line, so the admin screen can show which lines are currently occupied without
 * a second request.
 */
export const GET = route(async (request: Request) => {
  const includeInactive = searchParams(request).get('includeInactive') === 'true';
  const repository = getRepository();

  const [lines, activeBatches] = await Promise.all([
    listLines({ includeInactive }),
    repository.listActiveBatches(),
  ]);

  const runningLineIds = new Set(activeBatches.map((batch) => batch.lineId));

  return jsonOk({
    lines: lines.map((line) => ({ ...line, running: runningLineIds.has(line.id) })),
  });
});

/** `POST /api/lines` — creates a line. The short code must be unique. */
export const POST = route(async (request: Request) => {
  const input = await readJson(request, lineCreateSchema);
  const line = await createLine(input);
  return jsonOk({ line }, 201);
});
