/**
 * Production line management.
 *
 * Lines are first-class, fully dynamic records — the factory is not limited to
 * a hard-coded Line A / Line B pair. Supervisors create, rename, reorder and
 * retire lines from the admin console, and the station dashboard renders one
 * live card per active line in the configured order.
 *
 * Two rules live here:
 *   1. The short `code` is unique, so dense tables and CSV exports stay
 *      unambiguous.
 *   2. A line that already ran batches cannot be deleted — it is deactivated,
 *      because historical batches reference it and deleting it would orphan the
 *      production ledger.
 */

import type { ProductionLine } from '@/lib/domain/types';
import { getRepository } from '@/lib/repo';
import { Errors } from '@/lib/utils/errors';
import { newId, nowIso } from '@/lib/utils/id';

export interface LineInput {
  name: string;
  code: string;
  sortOrder?: number;
  isActive?: boolean;
}

/** Normalises a short code: uppercase, letters/digits/dashes only. */
export function normalizeLineCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9\-_]/g, '');
}

function assertValidInput(input: LineInput): void {
  if (!input.name?.trim()) {
    throw Errors.validation('יש להזין שם לקו הייצור.');
  }
  if (!normalizeLineCode(input.code)) {
    throw Errors.validation('יש להזין קוד קצר לקו (אותיות באנגלית ומספרים בלבד).');
  }
}

export async function listLines(options?: { includeInactive?: boolean }): Promise<ProductionLine[]> {
  const lines = await getRepository().listProductionLines();
  return options?.includeInactive ? lines : lines.filter((line) => line.isActive);
}

export async function getLine(id: string): Promise<ProductionLine> {
  const line = await getRepository().getProductionLineById(id);
  if (!line) throw Errors.notFound('production_line');
  return line;
}

export async function getLineOrNull(id: string): Promise<ProductionLine | null> {
  return getRepository().getProductionLineById(id);
}

export async function assertLineCodeAvailable(code: string, excludeId?: string): Promise<void> {
  const existing = await getRepository().getProductionLineByCode(normalizeLineCode(code));
  if (existing && existing.id !== excludeId) {
    throw Errors.lineCodeTaken();
  }
}

export async function createLine(input: LineInput): Promise<ProductionLine> {
  assertValidInput(input);
  const repository = getRepository();
  const code = normalizeLineCode(input.code);

  await assertLineCodeAvailable(code);

  const existing = await repository.listProductionLines();
  const nextSortOrder =
    input.sortOrder !== undefined && Number.isFinite(input.sortOrder)
      ? Math.max(0, Math.round(input.sortOrder))
      : existing.reduce((max, line) => Math.max(max, line.sortOrder), -1) + 1;

  const line: ProductionLine = {
    id: newId(),
    name: input.name.trim(),
    code,
    sortOrder: nextSortOrder,
    isActive: input.isActive ?? true,
    createdAt: nowIso(),
  };

  return repository.insertProductionLine(line);
}

export async function updateLine(id: string, input: Partial<LineInput>): Promise<ProductionLine> {
  const repository = getRepository();
  await getLine(id);

  if (input.name !== undefined && !input.name.trim()) {
    throw Errors.validation('שם הקו לא יכול להיות ריק.');
  }
  if (input.code !== undefined) {
    if (!normalizeLineCode(input.code)) {
      throw Errors.validation('קוד הקו אינו תקין.');
    }
    await assertLineCodeAvailable(input.code, id);
  }

  return repository.updateProductionLine(id, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.code !== undefined ? { code: normalizeLineCode(input.code) } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: Math.max(0, Math.round(input.sortOrder)) } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });
}

export async function setLineActive(id: string, isActive: boolean): Promise<ProductionLine> {
  await getLine(id);
  return getRepository().updateProductionLine(id, { isActive });
}

export interface DeleteLineResult {
  deleted: boolean;
  deactivated: boolean;
  line: ProductionLine;
}

/**
 * Deletes a line, or deactivates it when it already has batch history.
 *
 * A line that is currently running a batch is refused outright — finish or
 * cancel the batch first, otherwise the production ledger would be left with an
 * orphaned running shift.
 */
export async function deleteLine(id: string): Promise<DeleteLineResult> {
  const repository = getRepository();
  const line = await getLine(id);

  const activeBatch = await repository.getActiveBatchByLine(id);
  if (activeBatch) {
    throw Errors.lineRunning();
  }

  const batches = await repository.listBatches({ lineId: id, limit: 1 });
  if (batches.length > 0) {
    const deactivated = await repository.updateProductionLine(id, { isActive: false });
    return { deleted: false, deactivated: true, line: deactivated };
  }

  await repository.deleteProductionLine(id);
  return { deleted: true, deactivated: false, line };
}

/** Persists a new display order. `ids` is the full ordered list of line ids. */
export async function reorderLines(ids: string[]): Promise<ProductionLine[]> {
  const repository = getRepository();
  const existing = await repository.listProductionLines();
  const known = new Map(existing.map((line) => [line.id, line]));

  let position = 0;
  for (const id of ids) {
    if (!known.has(id)) continue;
    await repository.updateProductionLine(id, { sortOrder: position });
    position += 1;
  }

  // Any line not mentioned keeps a stable slot after the listed ones.
  for (const line of existing) {
    if (ids.includes(line.id)) continue;
    await repository.updateProductionLine(line.id, { sortOrder: position });
    position += 1;
  }

  return repository.listProductionLines();
}

/**
 * Ensures the factory always has at least one usable line. Called by the seed
 * and by the bootstrap so a freshly truncated database is not unusable.
 */
export async function ensureDefaultLines(): Promise<ProductionLine[]> {
  const repository = getRepository();
  const existing = await repository.listProductionLines();
  if (existing.length > 0) return existing;

  const defaults: Array<{ name: string; code: string; sortOrder: number }> = [
    { name: 'קו A', code: 'LINE_A', sortOrder: 0 },
    { name: 'קו B', code: 'LINE_B', sortOrder: 1 },
  ];

  const created: ProductionLine[] = [];
  for (const seed of defaults) {
    created.push(
      await repository.insertProductionLine({
        id: newId(),
        name: seed.name,
        code: seed.code,
        sortOrder: seed.sortOrder,
        isActive: true,
        createdAt: nowIso(),
      }),
    );
  }
  return created;
}
