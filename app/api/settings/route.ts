import { jsonOk, readJson, route } from '@/lib/api/handler';
import { settingsUpdateSchema } from '@/lib/api/schemas';
import { getRuntimeSettings, listSettings, updateSettings } from '@/lib/services/settings';

export const dynamic = 'force-dynamic';

/** `GET /api/settings` */
export const GET = route(async () => {
  const [settings, runtime] = await Promise.all([listSettings(), getRuntimeSettings()]);
  return jsonOk({ settings, runtime });
});

/** `PUT /api/settings` — factory name, TV idle timeout, default race threshold. */
export const PUT = route(async (request: Request) => {
  const input = await readJson(request, settingsUpdateSchema);
  await updateSettings(input);
  const [settings, runtime] = await Promise.all([listSettings(), getRuntimeSettings()]);
  return jsonOk({ settings, runtime });
});
