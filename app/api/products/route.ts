import { jsonOk, readJson, route } from '@/lib/api/handler';
import { productCreateSchema } from '@/lib/api/schemas';
import { createProduct, listAllPalletSizes, listProducts } from '@/lib/services/products';

export const dynamic = 'force-dynamic';

/** `GET /api/products?includeInactive=true` */
export const GET = route(async (request: Request) => {
  const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true';
  const [products, palletSizes] = await Promise.all([
    listProducts({ includeInactive }),
    listAllPalletSizes(),
  ]);
  return jsonOk({ products, palletSizes });
});

/** `POST /api/products` — creates a product plus its predefined pallet sizes. */
export const POST = route(async (request: Request) => {
  const input = await readJson(request, productCreateSchema);
  const product = await createProduct(input);
  return jsonOk({ product }, 201);
});
