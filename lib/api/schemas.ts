/**
 * Request validation schemas.
 *
 * Every numeric field runs through a preprocessor that maps Arabic-Indic and
 * Persian digits to Western ones before coercion, so an operator typing on an
 * Arabic keyboard layout still produces valid Latin-digit data.
 */

import { z } from 'zod';

import { toWesternDigits } from '@/lib/domain/format';
import { PAUSE_REASON_CODES } from '@/lib/domain/types';

/**
 * Builds a numeric schema that first normalises whatever the operator typed.
 *
 * The output type is pinned to `number` (never `unknown`) so downstream service
 * calls stay strongly typed. Arabic-Indic, Persian and Devanagari digits are
 * mapped to Western digits, and thousands separators are stripped, so an
 * operator on an Arabic keyboard layout still stores `28` and never `٢٨`.
 */
const looseNumber = (schema: z.ZodNumber): z.ZodType<number, z.ZodTypeDef, unknown> =>
  z.any().transform<number>((value, ctx) => {
    const normalized = typeof value === 'string' ? toWesternDigits(value).replace(/[,\s]/g, '') : value;

    if (typeof normalized === 'string' && normalized === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'יש להזין מספר.' });
      return z.NEVER as never;
    }

    const parsed = typeof normalized === 'string' ? Number(normalized) : normalized;
    const result = schema.safeParse(parsed);

    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message });
      }
      return z.NEVER as never;
    }

    return result.data;
  });

const trimmedString = (max = 200) => z.string().trim().min(1).max(max);

/** Accepts an ISO instant or a local `YYYY-MM-DDTHH:mm` value from a date input. */
const dateTimeInput = z
  .string()
  .trim()
  .refine((value) => value === '' || !Number.isNaN(new Date(value).getTime()), {
    message: 'תאריך לא תקין.',
  });

/* ---------------------------------------------------------------- workers */

export const workerCreateSchema = z.object({
  fullName: trimmedString(120),
  employeeId: trimmedString(40),
  emoji: trimmedString(16),
  isActive: z.boolean().optional(),
});

export const workerUpdateSchema = workerCreateSchema;

export const workerActiveSchema = z.object({ isActive: z.boolean() });

/* ------------------------------------------------------- production lines */

export const lineCreateSchema = z.object({
  name: trimmedString(80),
  code: trimmedString(24),
  sortOrder: looseNumber(z.number().int().min(0).max(999)).optional(),
  isActive: z.boolean().optional(),
});

export const lineUpdateSchema = z.object({
  name: trimmedString(80).optional(),
  code: trimmedString(24).optional(),
  sortOrder: looseNumber(z.number().int().min(0).max(999)).optional(),
  isActive: z.boolean().optional(),
});

export const lineActiveSchema = z.object({ isActive: z.boolean() });

export const lineReorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

/* --------------------------------------------------------------- products */

export const palletSizeSchema = z.object({
  id: z.string().uuid().optional(),
  label: trimmedString(80),
  cartons: looseNumber(z.number().int().positive().max(10000)),
  sortOrder: looseNumber(z.number().int().min(0).max(999)).optional(),
});

export const productCreateSchema = z.object({
  name: trimmedString(160),
  sku: z.string().trim().max(60).nullish(),
  sizeLabel: trimmedString(60),
  cartonsPerLayout: looseNumber(z.number().int().positive().max(10000)),
  pointValue: looseNumber(z.number().positive().max(1000)),
  isActive: z.boolean().optional(),
  palletSizes: z.array(palletSizeSchema).max(30).optional(),
});

export const productUpdateSchema = productCreateSchema;

export const productActiveSchema = z.object({ isActive: z.boolean() });

/* ------------------------------------------------------------------ races */

export const racePointOverrideSchema = z.object({
  productId: z.string().uuid(),
  pointValue: looseNumber(z.number().positive().max(1000)),
});

export const raceCreateSchema = z.object({
  name: trimmedString(120),
  prizeDescription: z.string().trim().max(400).nullish(),
  startAt: dateTimeInput.optional(),
  endAt: dateTimeInput.nullish(),
  minActiveHours: looseNumber(z.number().min(0).max(10000)).optional(),
  /** Defaults to true — the new race becomes the default board to display. */
  isPrimary: z.boolean().optional(),
  productPoints: z.array(racePointOverrideSchema).max(200).optional(),
});

export const raceUpdateSchema = raceCreateSchema.partial();

export const raceFinishSchema = z
  .object({
    endAt: dateTimeInput.optional(),
    archiveNote: z.string().trim().max(400).nullish(),
  })
  .default({});

export const racePointOverridesSchema = z.object({
  productPoints: z.array(racePointOverrideSchema).max(200),
});

/* ---------------------------------------------------------------- batches */

export const batchStartSchema = z.object({
  lineId: z.string().uuid(),
  productId: z.string().uuid(),
  memberIds: z.array(z.string().uuid()).min(1).max(50),
  notes: z.string().trim().max(500).nullish(),
});

export const batchPauseSchema = z.object({
  reasonCode: z.enum(PAUSE_REASON_CODES as unknown as [string, ...string[]]),
  note: z.string().trim().max(300).nullish(),
});

export const palletCreateSchema = z
  .object({
    palletSizeId: z.string().uuid().nullish(),
    cartons: looseNumber(z.number().int().positive().max(10000)).nullish(),
    note: z.string().trim().max(300).nullish(),
  })
  .refine((value) => Boolean(value.palletSizeId) || Boolean(value.cartons), {
    message: 'יש לבחור גודל משטח או להזין מספר קרטונים.',
    path: ['cartons'],
  });

export const batchMemberAddSchema = z.object({ workerId: z.string().uuid() });

export const batchFinishSchema = z.object({ notes: z.string().trim().max(500).nullish() }).default({});

export const palletPreviewSchema = z.object({
  productId: z.string().uuid(),
  cartons: looseNumber(z.number().int().positive().max(10000)),
  batchId: z.string().uuid().optional(),
});

/* --------------------------------------------------------------- settings */

export const tvPanelKeySchema = z.enum([
  'leaderboard_volume',
  'leaderboard_efficiency',
  'active_batches',
  'daily',
  'race_stats',
]);

export const settingsUpdateSchema = z.object({
  factoryName: z.string().trim().max(120).optional(),
  tvIdleSeconds: looseNumber(z.number().min(3).max(600)).optional(),
  tvSlideSeconds: looseNumber(z.number().min(3).max(120)).optional(),
  /** Which panels the TV Mode rotation includes. An empty array is valid. */
  tvPanels: z.array(tvPanelKeySchema).max(10).optional(),
  defaultMinRaceHours: looseNumber(z.number().min(0).max(10000)).optional(),
});

/* --------------------------------------------------------------- reporting */

export const reportRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

/** Accepts a `YYYY-MM-DD` key, or any parseable instant, for the daily screen. */
export const dailyQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), { message: 'תאריך לא תקין.' })
    .optional(),
});
