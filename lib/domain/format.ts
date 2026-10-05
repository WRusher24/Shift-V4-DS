/**
 * Number, time and date formatting for the Shift UI.
 *
 * HARD RULE (product requirement)
 * -------------------------------
 * Every number rendered anywhere in the UI — counters, timers, weights, dates,
 * points, chart axes — uses Western/ASCII digits (0-9). Hebrew and
 * Arabic-Indic numerals must never appear, regardless of the operator's browser
 * or OS locale.
 *
 * Two independent safeguards are applied:
 *   1. `en-US` / `en-GB` are hard-coded as the formatting locales.
 *   2. The `-u-nu-latn` Unicode extension is appended to force the Latin
 *      numbering system even if a locale default were ever to change.
 *
 * Timers and counters additionally use `font-variant-numeric: tabular-nums`
 * (see `.numeric` in globals.css) so digits never jitter while ticking.
 */

export const NUMBER_LOCALE = 'en-US';
export const NUMBER_LOCALE_LATN = 'en-US-u-nu-latn';
export const DATE_LOCALE = 'en-GB';
export const DATE_LOCALE_LATN = 'en-GB-u-nu-latn';

const integerFormatter = new Intl.NumberFormat(NUMBER_LOCALE_LATN, {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat(NUMBER_LOCALE_LATN, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const pointsFormatter = new Intl.NumberFormat(NUMBER_LOCALE_LATN, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const rateFormatter = new Intl.NumberFormat(NUMBER_LOCALE_LATN, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** `1234567` -> `1,234,567` */
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  return integerFormatter.format(Math.round(value));
}

/** `42.0` -> `42`, `42.55` -> `42.6` */
export function formatDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  return decimalFormatter.format(value);
}

/** Points, up to 2 decimals: `1234.567` -> `1,234.57` */
export function formatPoints(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  return pointsFormatter.format(value);
}

/** One-decimal rate used by the efficiency leaderboard. */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0.0';
  return rateFormatter.format(value);
}

/** `95` -> `95%` */
export function formatPercent(ratio: number | null | undefined, decimals = 0): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '0%';
  const formatter = new Intl.NumberFormat(NUMBER_LOCALE_LATN, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return formatter.format(ratio);
}

/* -------------------------------------------------------------------------- */
/*  Durations                                                                 */
/* -------------------------------------------------------------------------- */

function pad(value: number, length = 2): string {
  return String(Math.max(0, Math.trunc(value))).padStart(length, '0');
}

/** `HH:MM:SS` — always at least two hour digits so the timer never reflows. */
export function formatClock(totalSeconds: number | null | undefined): string {
  const safe = Math.max(0, Math.trunc(totalSeconds ?? 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** `MM:SS` — compact variant for dense tables. */
export function formatClockShort(totalSeconds: number | null | undefined): string {
  const safe = Math.max(0, Math.trunc(totalSeconds ?? 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** `2 שע׳ 14 דק׳` style Hebrew duration, always with Latin digits. */
export function formatDurationHe(totalSeconds: number | null | undefined): string {
  const safe = Math.max(0, Math.trunc(totalSeconds ?? 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${formatInt(hours)} שע׳ ${formatInt(minutes)} דק׳`;
  if (hours > 0) return `${formatInt(hours)} שע׳`;
  if (minutes > 0) return `${formatInt(minutes)} דק׳`;
  return `${formatInt(safe)} שנ׳`;
}

/** `12.5` hours -> `12:30` in H:MM. */
export function formatHoursAsClock(hours: number | null | undefined): string {
  const safe = Math.max(0, hours ?? 0);
  const wholeHours = Math.floor(safe);
  const minutes = Math.round((safe - wholeHours) * 60);
  if (minutes === 60) return `${formatInt(wholeHours + 1)}:00`;
  return `${formatInt(wholeHours)}:${pad(minutes)}`;
}

/* -------------------------------------------------------------------------- */
/*  Dates                                                                     */
/* -------------------------------------------------------------------------- */

/** `05/10/2026` */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const formatter = new Intl.DateTimeFormat(DATE_LOCALE_LATN, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return formatter.format(date);
}

/** `05/10/2026 14:32` */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const formatter = new Intl.DateTimeFormat(DATE_LOCALE_LATN, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

/** `14:32:07` */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const formatter = new Intl.DateTimeFormat(DATE_LOCALE_LATN, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

/** `2026-10-05` — stable key for grouping and CSV output. */
export function formatDateKey(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

/** Relative Hebrew label: `לפני 12 דק׳`. */
export function formatRelativeHe(value: string | Date | null | undefined, now = Date.now()): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffSeconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (diffSeconds < 45) return 'עכשיו';
  if (diffSeconds < 3600) return `לפני ${formatInt(Math.round(diffSeconds / 60))} דק׳`;
  if (diffSeconds < 86400) return `לפני ${formatInt(Math.round(diffSeconds / 3600))} שע׳`;
  return `לפני ${formatInt(Math.round(diffSeconds / 86400))} ימים`;
}

/**
 * Strips any non-ASCII digit characters that may arrive from user input
 * (Arabic-Indic ٠١٢٣, Extended Arabic-Indic ۰۱۲۳, Devanagari, ...) and maps
 * them to their Western equivalents. Applied to every numeric form field so
 * stored data is always Latin-digit.
 */
const DIGIT_MAP: Record<string, string> = {
  // Arabic-Indic
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  // Extended Arabic-Indic (Persian / Urdu)
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  // Devanagari
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

export function toWesternDigits(input: string): string {
  let out = '';
  for (const char of input) {
    out += DIGIT_MAP[char] ?? char;
  }
  return out;
}

/** Parses a user-typed number that may contain localised digits or separators. */
export function parseNumericInput(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const normalized = toWesternDigits(input.trim()).replace(/[,\s]/g, '');
  if (normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
