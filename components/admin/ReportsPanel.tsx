'use client';

import { useState } from 'react';

import { t } from '@/lib/i18n/he';
import { downloadCsv } from '@/lib/client/api';
import { Button, SectionHeader } from '@/components/ui/primitives';
import { Field, TextInput } from '@/components/ui/fields';

interface ReportDefinition {
  key: string;
  title: string;
  hint: string;
  icon: string;
  columns: string[];
}

/**
 * Reports & CSV export.
 *
 * Four exports cover the operational and payroll needs:
 *   batches  — the full shift ledger
 *   workers  — per-worker point and efficiency summary
 *   downtime — pause time by reason
 *   pallets  — every pallet with its exact per-member split
 *
 * All files are UTF-8 with a BOM and a `sep=,` hint, so Excel on a Hebrew
 * Windows install opens them with the headers and digits intact.
 */
const REPORTS: ReportDefinition[] = [
  {
    key: 'batches',
    title: t('admin.reports.batches'),
    hint: t('admin.reports.batchesHint'),
    icon: '🗂️',
    columns: [
      'תאריך',
      'קו',
      'מוצר',
      'שעת התחלה',
      'שעת סיום',
      'משך כולל',
      'זמן עבודה נטו',
      'זמן מושבת',
      'משטחים',
      'קרטונים',
      'נקודות',
      'נק׳ לשעה',
      'צוות',
      'פירוט השבתות',
    ],
  },
  {
    key: 'workers',
    title: t('admin.reports.workers'),
    hint: t('admin.reports.workersHint'),
    icon: '👷',
    columns: ['אימוג׳', 'שם העובד', 'מספר עובד', 'מרוצים', 'אצוות', 'משטחים', 'קרטונים', 'נקודות', 'שעות פעילות', 'PPH'],
  },
  {
    key: 'downtime',
    title: t('admin.reports.downtime'),
    hint: t('admin.reports.downtimeHint'),
    icon: '⏸',
    columns: ['סיבת ההשהיה', 'קוד', 'מספר אירועים', 'סה״כ זמן מושבת', 'שעות', 'משך ממוצע', 'אצוות מושפעות'],
  },
  {
    key: 'pallets',
    title: t('admin.reports.pallets'),
    hint: t('admin.reports.palletsHint'),
    icon: '📦',
    columns: ['מועד רישום', 'קו', 'מוצר', 'מרוץ', 'קרטונים', 'ערך נקודה', 'נקודות המשטח', 'עובד', 'נקודות לעובד', 'הערה'],
  },
  {
    key: 'daily',
    title: t('admin.reports.daily'),
    hint: t('admin.reports.dailyHint'),
    icon: '📅',
    columns: ['מדד', 'ערך', 'מוצר', 'משטחים', 'קרטונים', 'נקודות', 'נתח', 'קו', 'עובדים'],
  },
];

function defaultRange(): { from: string; to: string } {
  const pad = (value: number) => String(value).padStart(2, '0');
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86400000);
  const toValue = `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`;
  const fromValue = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
  return { from: fromValue, to: toValue };
}

export function ReportsPanel() {
  const [range, setRange] = useState(defaultRange);

  const href = (report: string) => {
    const params = new URLSearchParams();
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    return `/api/reports/${report}?${params.toString()}`;
  };

  return (
    <div>
      <SectionHeader title={t('admin.reports.title')} subtitle={t('admin.reports.subtitle')} />

      {/* Period */}
      <section className="card card-pad mb-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('admin.reports.periodFrom')}>
            <TextInput
              type="date"
              freeText={false}
              value={range.from}
              onChange={(event) => setRange((previous) => ({ ...previous, from: event.target.value }))}
            />
          </Field>
          <Field label={t('admin.reports.periodTo')}>
            <TextInput
              type="date"
              freeText={false}
              value={range.to}
              onChange={(event) => setRange((previous) => ({ ...previous, to: event.target.value }))}
            />
          </Field>
          <div className="flex items-end">
            <Button variant="subtle" block onClick={() => setRange(defaultRange())}>
              {t('chart.last14days')}
            </Button>
          </div>
        </div>
      </section>

      {/* Export cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        {REPORTS.map((report) => (
          <article key={report.key} className="card card-pad flex flex-col">
            <header className="mb-3 flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl"
              >
                {report.icon}
              </span>
              <div>
                <h3 className="text-lg font-black text-ink">{report.title}</h3>
                <p className="text-sm text-ink-muted">{report.hint}</p>
              </div>
            </header>

            <div className="mb-4 flex-1">
              <p className="stat-label mb-1.5">עמודות בקובץ</p>
              <div className="flex flex-wrap gap-1.5">
                {report.columns.map((column) => (
                  <span
                    key={column}
                    className="rounded-lg border border-surface-line bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-soft"
                  >
                    {column}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="live" onClick={() => downloadCsv(href(report.key))} icon="⬇">
                {t('admin.reports.download')}
              </Button>
              <span className="text-xs text-ink-muted">CSV · UTF-8 · Excel-ready</span>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-5 text-xs text-ink-muted">
        הקבצים כוללים BOM ורמז <span className="numeric">sep=,</span> כדי שאקסל בעברית יציג כותרות וספרות
        נכון. הספרות בקובץ הן ספרות מערביות בלבד (0-9).
      </p>
    </div>
  );
}
