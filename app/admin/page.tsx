import type { Metadata } from 'next';

import { AdminTabs } from '@/components/admin/AdminTabs';
import { getRaceLeaderboard } from '@/lib/services/leaderboard';
import { listAllPalletSizes, listProducts } from '@/lib/services/products';
import { getRaceSummaries, listRaces } from '@/lib/services/races';
import { getRuntimeSettings } from '@/lib/services/settings';
import { listWorkers } from '@/lib/services/workers';
import { getRepository } from '@/lib/repo';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'ניהול',
  description: 'ניהול עובדים, קווי ייצור, מוצרים ומשטחים, מרוצים, הגדרות מערכת ודוחות CSV.',
};

/**
 * Admin console.
 *
 * Loads every lookup list on the server so the panels hydrate fully populated,
 * then hands over to the client shell which owns tab state and all mutations.
 */
export default async function AdminPage() {
  const repository = getRepository();

  const [workers, lines, products, palletSizes, races, summaries, leaderboard, settings, activeBatches] =
    await Promise.all([
      listWorkers({ includeInactive: true }),
      repository.listProductionLines(),
      listProducts({ includeInactive: true }),
      listAllPalletSizes(),
      listRaces(),
      getRaceSummaries(),
      getRaceLeaderboard(),
      getRuntimeSettings(),
      repository.listActiveBatches(),
    ]);

  // Annotate each line with whether it is currently occupied, so the panel can
  // show "running" without a second round trip.
  const runningLineIds = new Set(activeBatches.map((batch) => batch.lineId));

  return (
    <AdminTabs
      workers={workers}
      lines={lines.map((line) => ({ ...line, running: runningLineIds.has(line.id) }))}
      products={products}
      palletSizes={palletSizes}
      races={races}
      summaries={summaries}
      leaderboard={leaderboard}
      settings={settings}
    />
  );
}
