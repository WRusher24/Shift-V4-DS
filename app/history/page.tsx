import type { Metadata } from 'next';

import { HistoryView } from '@/components/history/HistoryView';
import { getHistory } from '@/lib/services/reports';
import { addDays, endOfDay, startOfDay } from '@/lib/utils/id';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'היסטוריה',
  description: 'יומן אצוות מלא — זמני עבודה, השבתות, צוותים ונקודות, עם ייצוא ל-CSV.',
};

/** Local `YYYY-MM-DD` key for a date, used as the default filter values. */
function dateInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Shift history ledger.
 *
 * Defaults to the last 14 days, which matches the seed window, and loads the
 * first page on the server so the table is populated before hydration.
 */
export default async function HistoryPage() {
  const to = new Date();
  const from = addDays(to, -14);

  const bundle = await getHistory({
    from: startOfDay(from).toISOString(),
    to: endOfDay(to).toISOString(),
    status: 'COMPLETED',
    limit: 500,
  });

  return <HistoryView initial={bundle} defaultFrom={dateInputValue(from)} defaultTo={dateInputValue(to)} />;
}
