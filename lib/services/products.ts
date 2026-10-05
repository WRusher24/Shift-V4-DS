/**
 * Product & pallet-size management.
 *
 * A product carries:
 *   - a free-text name in Hebrew / Arabic / English
 *   - a bottle or gallon size label
 *   - cartons per carton layout
 *   - a per-carton **point value** (the complexity / value multiplier)
 *   - one or more predefined pallet sizes (e.g. 28 or 32 cartons)
 *
 * Deleting a product that already produced batches would break the history
 * ledger, so those products are deactivated instead.
 */

import type { PalletSize, Product } from '@/lib/domain/types';
import { getRepository } from '@/lib/repo';
import { Errors } from '@/lib/utils/errors';
import { newId, nowIso } from '@/lib/utils/id';

export interface PalletSizeInput {
  id?: string;
  label: string;
  cartons: number;
  sortOrder?: number;
}

export interface ProductInput {
  name: string;
  sku?: string | null;
  sizeLabel: string;
  cartonsPerLayout: number;
  pointValue: number;
  isActive?: boolean;
  palletSizes?: PalletSizeInput[];
}

function assertValidInput(input: ProductInput): void {
  if (!input.name?.trim()) throw Errors.validation('יש להזין שם מוצר.');
  if (!input.sizeLabel?.trim()) throw Errors.validation('יש להזין נפח / גודל למוצר.');
  if (!Number.isFinite(input.cartonsPerLayout) || input.cartonsPerLayout <= 0) {
    throw Errors.validation('מספר הקרטונים בפריסה חייב להיות גדול מ-0.');
  }
  if (!Number.isFinite(input.pointValue) || input.pointValue <= 0) {
    throw Errors.validation('ערך הנקודות לקרטון חייב להיות גדול מ-0.');
  }
  for (const size of input.palletSizes ?? []) {
    if (!Number.isFinite(size.cartons) || size.cartons <= 0 || !Number.isInteger(size.cartons)) {
      throw Errors.invalidCartons();
    }
    if (!size.label?.trim()) throw Errors.validation('יש להזין תיאור לכל גודל משטח.');
  }

  const cartonsList = (input.palletSizes ?? []).map((size) => size.cartons);
  if (new Set(cartonsList).size !== cartonsList.length) {
    throw Errors.validation('לא ניתן להגדיר שני גדלי משטח עם אותו מספר קרטונים.');
  }
}

export async function listProducts(options?: { includeInactive?: boolean }): Promise<Product[]> {
  const products = await getRepository().listProducts();
  return options?.includeInactive ? products : products.filter((product) => product.isActive);
}

export async function getProduct(id: string): Promise<Product> {
  const product = await getRepository().getProductById(id);
  if (!product) throw Errors.notFound('product');
  return product;
}

export async function listPalletSizes(productId: string): Promise<PalletSize[]> {
  return getRepository().listPalletSizesByProduct(productId);
}

export async function listAllPalletSizes(): Promise<PalletSize[]> {
  return getRepository().listPalletSizes();
}

/** Every product's pallet sizes, keyed by product id — used by the dashboard. */
export async function palletSizesByProduct(): Promise<Record<string, PalletSize[]>> {
  const sizes = await getRepository().listPalletSizes();
  const grouped: Record<string, PalletSize[]> = {};
  for (const size of sizes) {
    const list = grouped[size.productId] ?? [];
    list.push(size);
    grouped[size.productId] = list;
  }
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.cartons - b.cartons);
  }
  return grouped;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  assertValidInput(input);
  const repository = getRepository();

  const product: Product = {
    id: newId(),
    name: input.name.trim(),
    sku: input.sku?.trim() || null,
    sizeLabel: input.sizeLabel.trim(),
    cartonsPerLayout: Math.round(input.cartonsPerLayout),
    pointValue: input.pointValue,
    isActive: input.isActive ?? true,
    createdAt: nowIso(),
  };

  const created = await repository.insertProduct(product);

  for (const [index, size] of (input.palletSizes ?? []).entries()) {
    await repository.insertPalletSize({
      id: newId(),
      productId: created.id,
      label: size.label.trim(),
      cartons: Math.round(size.cartons),
      sortOrder: size.sortOrder ?? index,
    });
  }

  return created;
}

/**
 * Updates a product and reconciles its pallet sizes.
 *
 * Reconciliation is idempotent: sizes that already exist are updated in place
 * (so historical `pallet_logs.pallet_size_id` references stay valid), new ones
 * are inserted, and ones removed from the payload are deleted.
 */
export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  assertValidInput(input);
  const repository = getRepository();
  await getProduct(id);

  const updated = await repository.updateProduct(id, {
    name: input.name.trim(),
    sku: input.sku?.trim() || null,
    sizeLabel: input.sizeLabel.trim(),
    cartonsPerLayout: Math.round(input.cartonsPerLayout),
    pointValue: input.pointValue,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });

  if (input.palletSizes) {
    const existing = await repository.listPalletSizesByProduct(id);
    const existingById = new Map(existing.map((size) => [size.id, size]));
    const keptIds = new Set<string>();

    for (const [index, size] of input.palletSizes.entries()) {
      const sortOrder = size.sortOrder ?? index;
      if (size.id && existingById.has(size.id)) {
        keptIds.add(size.id);
        await repository.updatePalletSize(size.id, {
          label: size.label.trim(),
          cartons: Math.round(size.cartons),
          sortOrder,
        });
      } else {
        const inserted = await repository.insertPalletSize({
          id: newId(),
          productId: id,
          label: size.label.trim(),
          cartons: Math.round(size.cartons),
          sortOrder,
        });
        keptIds.add(inserted.id);
      }
    }

    for (const size of existing) {
      if (!keptIds.has(size.id)) {
        await repository.deletePalletSize(size.id);
      }
    }
  }

  return updated;
}

export async function setProductActive(id: string, isActive: boolean): Promise<Product> {
  await getProduct(id);
  return getRepository().updateProduct(id, { isActive });
}

export interface DeleteProductResult {
  deleted: boolean;
  deactivated: boolean;
  product: Product;
}

export async function deleteProduct(id: string): Promise<DeleteProductResult> {
  const repository = getRepository();
  const product = await getProduct(id);

  const batches = await repository.listBatches({ productId: id, limit: 1 });
  if (batches.length > 0) {
    const deactivated = await repository.updateProduct(id, { isActive: false });
    return { deleted: false, deactivated: true, product: deactivated };
  }

  await repository.deletePalletSizesByProduct(id);
  await repository.deleteProduct(id);
  return { deleted: true, deactivated: false, product };
}
