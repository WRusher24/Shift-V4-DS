import { jsonOk, readJson, route } from '@/lib/api/handler';
import { productUpdateSchema } from '@/lib/api/schemas';
import { deleteProduct, getProduct, listPalletSizes, updateProduct } from '@/lib/services/products';
import { Errors } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

/** `GET /api/products/:id` */
export const GET = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  const [product, palletSizes] = await Promise.all([getProduct(id), listPalletSizes(id)]);
  return jsonOk({ product, palletSizes });
});

/** `PATCH /api/products/:id` — reconciles the pallet-size set idempotently. */
export const PATCH = route(async (request: Request, context: Context) => {
  const { id } = await context.params;
  const input = await readJson(request, productUpdateSchema);
  const product = await updateProduct(id, input);
  return jsonOk({ product, palletSizes: await listPalletSizes(id) });
});

/** `DELETE /api/products/:id` — deactivates when history exists. */
export const DELETE = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  if (!id) throw Errors.notFound('product');
  return jsonOk(await deleteProduct(id));
});
