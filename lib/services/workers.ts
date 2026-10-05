/**
 * Worker management.
 *
 * Two business rules live here:
 *   1. The profile emoji must be unique across the whole crew — enforced in
 *      the service *and* by a database unique index, so a race condition can
 *      never let two workers share an emoji.
 *   2. Deleting a worker who already has production history would destroy the
 *      payroll trail. Those workers are deactivated instead of removed.
 */

import type { Worker } from '@/lib/domain/types';
import { getRepository } from '@/lib/repo';
import { Errors } from '@/lib/utils/errors';
import { newId, nowIso } from '@/lib/utils/id';

export interface WorkerInput {
  fullName: string;
  employeeId: string;
  emoji: string;
  isActive?: boolean;
}

/** Trims and normalises a user-supplied emoji (keeps the first grapheme). */
export function normalizeEmoji(input: string): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';
  // Use the Unicode-aware grapheme splitter so multi-codepoint emoji
  // (flags, skin-tone modifiers, ZWJ sequences) stay intact.
  const segmenter = new Intl.Segmenter('he', { granularity: 'grapheme' });
  const first = [...segmenter.segment(trimmed)][0];
  return first?.segment ?? trimmed;
}

function assertValidInput(input: WorkerInput): void {
  if (!input.fullName?.trim()) {
    throw Errors.validation('יש להזין שם מלא.');
  }
  if (!input.employeeId?.trim()) {
    throw Errors.validation('יש להזין מספר עובד.');
  }
  if (!normalizeEmoji(input.emoji)) {
    throw Errors.validation('יש לבחור אימוג׳ אישי לעובד.');
  }
}

/**
 * Ensures no *other* worker already uses `emoji`.
 * `excludeWorkerId` allows an edit to keep its own emoji.
 */
export async function assertEmojiAvailable(emoji: string, excludeWorkerId?: string): Promise<void> {
  const normalized = normalizeEmoji(emoji);
  const existing = await getRepository().getWorkerByEmoji(normalized);
  if (existing && existing.id !== excludeWorkerId) {
    throw Errors.emojiTaken();
  }
}

export async function assertEmployeeIdAvailable(employeeId: string, excludeWorkerId?: string): Promise<void> {
  const existing = await getRepository().getWorkerByEmployeeId(employeeId.trim());
  if (existing && existing.id !== excludeWorkerId) {
    throw Errors.employeeIdTaken();
  }
}

export async function listWorkers(options?: { includeInactive?: boolean }): Promise<Worker[]> {
  const workers = await getRepository().listWorkers();
  return options?.includeInactive ? workers : workers.filter((worker) => worker.isActive);
}

export async function getWorker(id: string): Promise<Worker> {
  const worker = await getRepository().getWorkerById(id);
  if (!worker) throw Errors.notFound('worker');
  return worker;
}

export async function createWorker(input: WorkerInput): Promise<Worker> {
  assertValidInput(input);
  const emoji = normalizeEmoji(input.emoji);

  await assertEmojiAvailable(emoji);
  await assertEmployeeIdAvailable(input.employeeId);

  const worker: Worker = {
    id: newId(),
    fullName: input.fullName.trim(),
    employeeId: input.employeeId.trim(),
    emoji,
    isActive: input.isActive ?? true,
    createdAt: nowIso(),
  };

  return getRepository().insertWorker(worker);
}

export async function updateWorker(id: string, input: WorkerInput): Promise<Worker> {
  assertValidInput(input);
  const emoji = normalizeEmoji(input.emoji);

  await getWorker(id);
  await assertEmojiAvailable(emoji, id);
  await assertEmployeeIdAvailable(input.employeeId, id);

  return getRepository().updateWorker(id, {
    fullName: input.fullName.trim(),
    employeeId: input.employeeId.trim(),
    emoji,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });
}

export async function setWorkerActive(id: string, isActive: boolean): Promise<Worker> {
  await getWorker(id);
  return getRepository().updateWorker(id, { isActive });
}

export interface DeleteWorkerResult {
  deleted: boolean;
  /** True when the worker was deactivated instead of removed. */
  deactivated: boolean;
  worker: Worker;
}

/**
 * Deletes a worker, or deactivates them when they appear in production
 * history. Returns which of the two happened so the UI can explain it.
 */
export async function deleteWorker(id: string): Promise<DeleteWorkerResult> {
  const repository = getRepository();
  const worker = await getWorker(id);

  const memberships = await repository.listBatchMembersForBatches(
    (await repository.listBatches({ limit: 100000 })).map((batch) => batch.id),
  );
  const hasHistory = memberships.some((member) => member.workerId === id);

  if (hasHistory) {
    const deactivated = await repository.updateWorker(id, { isActive: false });
    return { deleted: false, deactivated: true, worker: deactivated };
  }

  await repository.deleteWorker(id);
  return { deleted: true, deactivated: false, worker };
}

/** Emojis still free — used by the picker so the UI can grey out taken ones. */
export async function availableEmojis(): Promise<{ taken: string[]; free: string[] }> {
  const workers = await getRepository().listWorkers();
  const taken = workers.map((worker) => worker.emoji);
  return { taken, free: [] };
}
