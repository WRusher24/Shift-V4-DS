import { jsonOk, route } from '@/lib/api/handler';
import { getHealth } from '@/lib/services/state';

export const dynamic = 'force-dynamic';

/** `GET /api/health` — storage diagnostics and record counts. */
export const GET = route(async () => jsonOk(await getHealth()));
