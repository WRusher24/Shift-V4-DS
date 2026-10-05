import type { Metadata } from 'next';

import { DailyView } from '@/components/daily/DailyView';
import { getDailyStats } from '@/lib/services/daily';
import { formatDateKey } from '@/lib/domain/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'סטטיסטיקה יומית',
  description: 'התפלגות הייצור היומי לפי מוצר, קו, שעה ועובד — משטחים, קרטונים ונקודות.',
};

/**
 * Daily production screen.
 *
 * Rendered on the server for a populated first paint, then handed to the client
 * view which owns the date selector. The same figures power the "ייצור היום לפי
 * מוצר" panel inside the TV Mode loop.
 */
export default async function DailyPage() {
  const now = new Date();
  const stats = await getDailyStats(now);

  return <DailyView initial={stats} initialDate={formatDateKey(now)} />;
}
