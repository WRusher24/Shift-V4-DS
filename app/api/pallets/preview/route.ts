import { jsonOk, readJson, route } from '@/lib/api/handler';
import { palletPreviewSchema } from '@/lib/api/schemas';
import { previewPalletPoints } from '@/lib/services/batches';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/pallets/preview`
 *
 * Pure calculation used by the "add pallet" dialog to show, before saving:
 * total points, how many members are currently active, and the per-member
 * share. No writes.
 */
export const POST = route(async (request: Request) => {
  const input = await readJson(request, palletPreviewSchema);
  return jsonOk(
    await previewPalletPoints(input.productId, input.cartons, input.batchId),
  );
});
