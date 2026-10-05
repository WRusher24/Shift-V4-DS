/**
 * Shared plumbing for every API route handler.
 *
 * Guarantees a consistent JSON envelope:
 *   success -> the handler's own payload
 *   failure -> `{ error: { code, message, details? } }` with a matching status
 *
 * `AppError` messages are already Hebrew and safe to show on the floor; any
 * other exception is logged server-side and replaced with a generic Hebrew
 * message so internals never leak into the UI.
 */

import { NextResponse } from 'next/server';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';

import { AppError } from '@/lib/utils/errors';
import { RepositoryError } from '@/lib/repo/types';

export function jsonOk<T>(payload: T, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (error instanceof RepositoryError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_error',
          message: 'הנתונים שהוזנו אינם תקינים.',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      { status: 422, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  console.error('[shift] Unhandled API error:', error);
  return NextResponse.json(
    { error: { code: 'internal_error', message: 'אירעה שגיאה בלתי צפויה. נסו שוב.' } },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Wraps a handler so thrown errors become well-formed JSON responses. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return jsonError(error);
    }
  };
}

/**
 * Parses and validates a JSON body.
 *
 * The schema's *input* type is intentionally left open (`any`) because several
 * schemas preprocess operator input — e.g. numbers typed with Arabic-Indic
 * digits or thousands separators. Only the parsed output type `T` matters to
 * callers. Validation failures surface as a Hebrew-flavoured `ZodError`, which
 * `jsonError` converts into a field-level 422 response.
 */
export async function readJson<T>(
  request: Request,
  schema: ZodType<T, ZodTypeDef, any>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError('invalid_json', 'גוף הבקשה אינו JSON תקין.', 400);
  }
  return schema.parse(raw) as T;
}

/** Reads optional query parameters. */
export function searchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}
