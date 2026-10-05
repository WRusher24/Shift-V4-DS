import { jsonOk, readJson, route } from '@/lib/api/handler';
import { workerCreateSchema } from '@/lib/api/schemas';
import { createWorker, listWorkers } from '@/lib/services/workers';

export const dynamic = 'force-dynamic';

/** `GET /api/workers?includeInactive=true` */
export const GET = route(async (request: Request) => {
  const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true';
  return jsonOk({ workers: await listWorkers({ includeInactive }) });
});

/** `POST /api/workers` — creates a worker, enforcing emoji uniqueness. */
export const POST = route(async (request: Request) => {
  const input = await readJson(request, workerCreateSchema);
  const worker = await createWorker(input);
  return jsonOk({ worker }, 201);
});
