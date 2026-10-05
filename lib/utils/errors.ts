/**
 * Application-level error type.
 *
 * Carries a stable machine code, an HTTP status and a **Hebrew** message that
 * is safe to display to an operator on the factory floor.
 */

import { he, type HeKey } from '@/lib/i18n/he';

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  /** Optional structured details (field name, offending value, ...). */
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

/** Builds an AppError from a dictionary key so messages stay localised. */
export function appError(
  code: string,
  key: HeKey,
  params?: Record<string, string | number>,
  status = 400,
  details?: Record<string, unknown>,
): AppError {
  const template = he[key] ?? key;
  const message = params
    ? template.replace(/\{(\w+)\}/g, (match, token: string) => {
        const value = params[token];
        return value === undefined ? match : String(value);
      })
    : template;
  return new AppError(code, message, status, details);
}

export const Errors = {
  validation: (message?: string) =>
    message
      ? new AppError('validation_error', message, 422)
      : appError('validation_error', 'error.validation', undefined, 422),
  notFound: (entity = 'resource') => appError('not_found', 'error.notFound', undefined, 404, { entity }),
  lineBusy: () => appError('line_busy', 'error.lineBusy', undefined, 409),
  lineCodeTaken: () => appError('line_code_duplicate', 'error.lineCodeDuplicate', undefined, 409),
  lineRunning: () => appError('line_running', 'error.lineRunning', undefined, 409),
  lineRequired: () => appError('line_required', 'error.lineRequired', undefined, 409),
  noActiveRace: () => appError('no_active_race', 'error.noActiveRace', undefined, 409),
  raceAlreadyFinished: () => appError('race_already_finished', 'error.raceAlreadyFinished', undefined, 409),
  batchNotActive: () => appError('batch_not_active', 'error.batchNotActive', undefined, 409),
  batchAlreadyPaused: () => appError('batch_already_paused', 'error.batchAlreadyPaused', undefined, 409),
  batchNotPaused: () => appError('batch_not_paused', 'error.batchNotPaused', undefined, 409),
  teamEmpty: () => appError('team_empty', 'error.teamEmpty', undefined, 409),
  workerAlreadyOnBatch: () => appError('worker_already_on_batch', 'error.workerAlreadyOnBatch', undefined, 409),
  emojiTaken: () => appError('worker_emoji_duplicate', 'error.workerEmojiDuplicate', undefined, 409),
  employeeIdTaken: () => appError('worker_employee_id_duplicate', 'error.workerEmployeeIdDuplicate', undefined, 409),
  workerInUse: () => appError('worker_in_use', 'error.workerInUse', undefined, 409),
  productInUse: () => appError('product_in_use', 'error.productInUse', undefined, 409),
  invalidCartons: () => appError('invalid_cartons', 'error.invalidCartons', undefined, 422),
  database: () => appError('database_error', 'error.databaseUnavailable', undefined, 503),
};
