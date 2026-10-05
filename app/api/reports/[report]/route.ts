import { route, searchParams } from '@/lib/api/handler';
import { getDowntimeReport, getHistory, getPalletLedger, getWorkerSummary } from '@/lib/services/reports';
import { getDailyStats } from '@/lib/services/daily';
import { csvFilename, csvResponse, toCsv } from '@/lib/utils/csv';
import { formatClock, formatDate, formatDateTime, formatPoints } from '@/lib/domain/format';
import { lineLabel, pauseReasonLabel } from '@/lib/i18n/he';
import { Errors } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

const REPORTS = ['batches', 'workers', 'downtime', 'pallets', 'daily'] as const;
type ReportKey = (typeof REPORTS)[number];

function isReportKey(value: string): value is ReportKey {
  return (REPORTS as readonly string[]).includes(value);
}

/**
 * `GET /api/reports/:report?from&to&date`
 *
 * Exports one of five operational reports as a **UTF-8 CSV with a byte order
 * mark** (`\uFEFF` -> `EF BB BF`). The BOM alone is sufficient for Excel on a
 * Hebrew Windows install and Google Sheets to open the file with the Hebrew
 * headers and Western digits intact instead of mojibake. A `sep=,` hint line
 * is intentionally NOT used as it can interfere with Excel's BOM detection.
 *
 *   batches  — full shift ledger: times, active/paused duration, line, team, points
 *   workers  — per-worker payroll summary: points, cartons, hours, PPH
 *   downtime — pause time grouped by reason, with averages
 *   pallets  — every pallet with its exact per-member point split
 *   daily    — daily production, pallet-first, with a per-product breakdown
 */
export const GET = route(async (request: Request, context: { params: Promise<{ report: string }> }) => {
  const { report } = await context.params;
  if (!isReportKey(report)) {
    throw Errors.notFound('report');
  }

  const params = searchParams(request);
  const from = params.get('from') ? new Date(params.get('from') as string).toISOString() : undefined;
  const to = params.get('to') ? new Date(params.get('to') as string).toISOString() : undefined;

  switch (report) {
    case 'batches': {
      const { rows } = await getHistory({ from, to, status: 'COMPLETED', limit: 100000 });
      const csv = toCsv(rows, [
        { key: 'date', header: 'תאריך', value: (row) => row.dateKey },
        { key: 'line', header: 'קו', value: (row) => lineLabel(row.line?.code ?? '?', row.line?.name) },
        { key: 'lineCode', header: 'קוד קו', value: (row) => row.line?.code ?? '' },
        { key: 'product', header: 'מוצר', value: (row) => row.product.name },
        { key: 'sku', header: 'מק״ט', value: (row) => row.product.sku ?? '' },
        { key: 'size', header: 'נפח', value: (row) => row.product.sizeLabel },
        { key: 'start', header: 'שעת התחלה', value: (row) => formatDateTime(row.startedAt) },
        { key: 'finish', header: 'שעת סיום', value: (row) => formatDateTime(row.finishedAt) },
        { key: 'elapsed', header: 'משך כולל (שע:דק:שנ)', value: (row) => formatClock(row.totalElapsedSeconds) },
        { key: 'active', header: 'זמן עבודה נטו', value: (row) => formatClock(row.activeSeconds) },
        { key: 'paused', header: 'זמן מושבת', value: (row) => formatClock(row.pausedSeconds) },
        { key: 'activeHours', header: 'שעות עבודה נטו', value: (row) => (row.activeSeconds / 3600).toFixed(2) },
        { key: 'pallets', header: 'משטחים', value: (row) => row.palletCount },
        { key: 'cartons', header: 'קרטונים', value: (row) => row.totalCartons },
        { key: 'points', header: 'נקודות', value: (row) => formatPoints(row.totalPoints) },
        {
          key: 'pph',
          header: 'נק׳ לשעה',
          value: (row) => (row.activeSeconds > 0 ? (row.totalPoints / (row.activeSeconds / 3600)).toFixed(1) : '0.0'),
        },
        {
          key: 'team',
          header: 'צוות',
          value: (row) => row.members.map((member) => `${member.emoji} ${member.fullName}`).join(' | '),
        },
        {
          key: 'pauses',
          header: 'פירוט השבתות',
          value: (row) =>
            row.pauseBreakdown
              .map(
                (bucket) =>
                  `${bucket.reasonLabel ?? pauseReasonLabel(bucket.reasonCode)}: ${formatClock(bucket.totalSeconds)}`,
              )
              .join(' | '),
        },
        { key: 'race', header: 'מרוצים', value: (row) => row.raceNames.join(' | ') },
        { key: 'notes', header: 'הערות', value: (row) => row.batch.notes ?? '' },
      ]);
      return csvResponse(csv, csvFilename('shift_batches'));
    }

    case 'workers': {
      const rows = await getWorkerSummary(from, to);
      const csv = toCsv(rows, [
        { key: 'emoji', header: 'אימוג׳', value: (row) => row.worker.emoji },
        { key: 'name', header: 'שם העובד', value: (row) => row.worker.fullName },
        { key: 'employeeId', header: 'מספר עובד', value: (row) => row.worker.employeeId },
        { key: 'races', header: 'מרוצים', value: (row) => row.races },
        { key: 'batches', header: 'אצוות', value: (row) => row.batches },
        { key: 'pallets', header: 'משטחים', value: (row) => row.pallets },
        { key: 'cartons', header: 'קרטונים', value: (row) => row.cartons },
        { key: 'points', header: 'סה״כ נקודות', value: (row) => formatPoints(row.points) },
        { key: 'activeHours', header: 'שעות עבודה נטו', value: (row) => row.activeHours.toFixed(2) },
        { key: 'activeClock', header: 'זמן עבודה נטו', value: (row) => formatClock(row.activeSeconds) },
        { key: 'pausedClock', header: 'זמן מושבת משויך', value: (row) => formatClock(row.pauseSeconds) },
        { key: 'pph', header: 'נק׳ לשעה (PPH)', value: (row) => formatPoints(row.pointsPerHour) },
      ]);
      return csvResponse(csv, csvFilename('shift_workers'));
    }

    case 'downtime': {
      const rows = await getDowntimeReport(from, to);
      const csv = toCsv(rows, [
        {
          key: 'reason',
          header: 'סיבת ההשהיה',
          value: (row) => row.reasonLabel ?? pauseReasonLabel(row.reasonCode),
        },
        { key: 'code', header: 'קוד', value: (row) => row.reasonCode },
        { key: 'occurrences', header: 'מספר אירועים', value: (row) => row.occurrences },
        { key: 'total', header: 'סה״כ זמן מושבת', value: (row) => formatClock(row.totalSeconds) },
        { key: 'totalHours', header: 'סה״כ שעות', value: (row) => (row.totalSeconds / 3600).toFixed(2) },
        { key: 'average', header: 'משך ממוצע', value: (row) => formatClock(row.averageSeconds) },
        { key: 'batches', header: 'אצוות מושפעות', value: (row) => row.affectedBatches },
      ]);
      return csvResponse(csv, csvFilename('shift_downtime'));
    }

    case 'pallets': {
      const rows = await getPalletLedger(from, to);
      const flat = rows.flatMap((entry) =>
        entry.awards.map((award) => ({
          createdAt: entry.pallet.createdAt,
          line: lineLabel(entry.line?.code ?? '?', entry.line?.name),
          product: entry.productName,
          races: entry.raceNames.join(' | '),
          cartons: entry.pallet.cartons,
          pointValue: entry.pallet.pointValue,
          palletTotal: entry.pallet.totalPoints,
          workerName: award.fullName,
          workerEmoji: award.emoji,
          points: award.points,
          note: entry.pallet.note ?? '',
        })),
      );
      const csv = toCsv(flat, [
        { key: 'createdAt', header: 'מועד רישום', value: (row) => formatDateTime(row.createdAt) },
        { key: 'line', header: 'קו', value: (row) => row.line },
        { key: 'product', header: 'מוצר', value: (row) => row.product },
        { key: 'races', header: 'מרוצים', value: (row) => row.races },
        { key: 'cartons', header: 'קרטונים במשטח', value: (row) => row.cartons },
        {
          key: 'pointValue',
          header: 'ערך נקודה לקרטון (בסיס)',
          value: (row) => row.pointValue,
        },
        {
          key: 'palletTotal',
          header: 'נקודות המשטח (בסיס)',
          value: (row) => formatPoints(row.palletTotal),
        },
        { key: 'emoji', header: 'אימוג׳', value: (row) => row.workerEmoji },
        { key: 'worker', header: 'עובד', value: (row) => row.workerName },
        {
          key: 'points',
          header: 'נקודות לעובד (לכל מרוץ בנפרד)',
          value: (row) => formatPoints(row.points),
        },
        { key: 'note', header: 'הערה', value: (row) => row.note },
      ]);
      return csvResponse(csv, csvFilename('shift_pallets'));
    }

    case 'daily': {
      const rawDate = params.get('date');
      const date = rawDate ? new Date(rawDate) : new Date();
      if (Number.isNaN(date.getTime())) throw Errors.validation('תאריך לא תקין.');

      const stats = await getDailyStats(date);

      // Sections are rendered *without* a BOM; exactly one is added for the
      // whole file below. Emitting them per section would produce a doubled
      // BOM (which Excel renders as a stray glyph).
      const section = { bom: false } as const;

      const summaryCsv = toCsv(
        [
          { label: 'תאריך', value: stats.dateKey },
          { label: 'סה״כ משטחים', value: stats.totals.pallets },
          { label: 'סה״כ קרטונים', value: stats.totals.cartons },
          { label: 'סה״כ נקודות', value: formatPoints(stats.totals.points) },
          { label: 'אצוות פעילות', value: stats.totals.batchesRunning },
          { label: 'אצוות שהושלמו', value: stats.totals.batchesCompleted },
          { label: 'זמן עבודה נטו', value: formatClock(stats.totals.activeSeconds) },
          { label: 'זמן מושבת', value: formatClock(stats.totals.pausedSeconds) },
        ],
        [
          { key: 'label', header: 'מדד', value: (row) => row.label },
          { key: 'value', header: 'ערך', value: (row) => row.value },
        ],
        section,
      );

      const productCsv = toCsv(
        stats.byProduct,
        [
          { key: 'product', header: 'מוצר', value: (row) => row.productName },
          { key: 'size', header: 'נפח', value: (row) => row.sizeLabel },
          { key: 'pallets', header: 'משטחים', value: (row) => row.pallets },
          { key: 'cartons', header: 'קרטונים', value: (row) => row.cartons },
          { key: 'points', header: 'נקודות', value: (row) => formatPoints(row.points) },
          { key: 'share', header: 'נתח מהמשטחים', value: (row) => `${(row.share * 100).toFixed(1)}%` },
        ],
        section,
      );

      const lineCsv = toCsv(
        stats.byLine,
        [
          { key: 'line', header: 'קו', value: (row) => lineLabel(row.lineCode, row.lineName) },
          { key: 'pallets', header: 'משטחים', value: (row) => row.pallets },
          { key: 'cartons', header: 'קרטונים', value: (row) => row.cartons },
          { key: 'points', header: 'נקודות', value: (row) => formatPoints(row.points) },
          { key: 'active', header: 'זמן עבודה', value: (row) => formatClock(row.activeSeconds) },
          { key: 'paused', header: 'זמן מושבת', value: (row) => formatClock(row.pausedSeconds) },
          { key: 'batches', header: 'אצוות', value: (row) => row.batches },
        ],
        section,
      );

      const workerCsv = toCsv(
        stats.topWorkers,
        [
          { key: 'emoji', header: 'אימוג׳', value: (row) => row.worker.emoji },
          { key: 'name', header: 'עובד', value: (row) => row.worker.fullName },
          { key: 'employeeId', header: 'מספר עובד', value: (row) => row.worker.employeeId },
          { key: 'pallets', header: 'משטחים', value: (row) => row.pallets },
          { key: 'cartons', header: 'קרטונים', value: (row) => row.cartons },
          { key: 'points', header: 'נקודות', value: (row) => formatPoints(row.points) },
          { key: 'active', header: 'זמן עבודה', value: (row) => formatClock(row.activeSeconds) },
        ],
        section,
      );

      // One sectioned file: one BOM, then the sections. No sep=, hint —
      // it can interfere with Excel's BOM detection on some versions.
      const sectioned = [
        `סיכום יומי — ${formatDate(date)}`,
        '',
        'סיכום כללי',
        summaryCsv,
        'פילוח לפי מוצר',
        productCsv,
        'פילוח לפי קו',
        lineCsv,
        'עובדים בולטים',
        workerCsv,
      ].join('\r\n');

      return csvResponse(`\uFEFF${sectioned}`, csvFilename(`shift_daily_${stats.dateKey}`));
    }
  }
});
