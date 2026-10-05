/**
 * CSV serialisation.
 *
 * Excel must open the file with correct encoding, so a UTF-8 BOM is
 * prepended. The BOM alone is sufficient — a `sep=,` hint line is NOT used
 * because it can interfere with Excel's BOM detection on some versions.
 *
 * Values are quoted only when necessary (RFC 4180).
 */

export interface CsvColumn<T> {
  /** Machine key, used as a stable reference. */
  key: string;
  /** Column header as shown in Excel — Hebrew. */
  header: string;
  /** Cell value. Return `null`/`undefined` for an empty cell. */
  value: (row: T) => string | number | null | undefined;
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], options?: { bom?: boolean }): string {
  const includeBom = options?.bom ?? true;

  const lines: string[] = [];
  lines.push(columns.map((column) => escapeCell(column.header)).join(','));
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(','));
  }

  const body = `${lines.join('\r\n')}\r\n`;
  return includeBom ? `\uFEFF${body}` : body;
}

/** Filename stamped with a sortable local timestamp. */
export function csvFilename(prefix: string, at: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}${pad(
    at.getMinutes(),
  )}`;
  return `${prefix}_${stamp}.csv`;
}

/**
 * Standard HTTP response carrying a CSV download.
 *
 * The response is built as a raw binary Blob with a clean UTF-8 BOM prefix.
 * The BOM is essential for Excel to recognize the file as UTF-8 and display
 * Hebrew text correctly. A `sep=,` hint line is intentionally NOT used as
 * it can interfere with Excel's BOM detection on some versions.
 */
export function csvResponse(csv: string, filename: string): Response {
  const BOM = '\uFEFF';
  // Strip any existing BOM to avoid duplication, then prepend a clean one.
  const withoutBom = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const csvContent = BOM + withoutBom;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
