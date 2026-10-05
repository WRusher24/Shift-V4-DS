'use client';

import { useState } from 'react';

import type {
  PalletSize,
  Product,
  ProductionLine,
  Race,
  RaceLeaderboard,
  RaceSummary,
  Worker,
} from '@/lib/domain/types';
import { t } from '@/lib/i18n/he';
import { LinesPanel } from '@/components/admin/LinesPanel';
import { ProductsPanel } from '@/components/admin/ProductsPanel';
import { RacesPanel } from '@/components/admin/RacesPanel';
import { ReportsPanel } from '@/components/admin/ReportsPanel';
import { SettingsPanel, type RuntimeSettings } from '@/components/admin/SettingsPanel';
import { WorkersPanel } from '@/components/admin/WorkersPanel';

type TabKey = 'workers' | 'lines' | 'products' | 'races' | 'settings' | 'reports';

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'workers', label: t('admin.tabWorkers'), icon: '👷' },
  { key: 'lines', label: t('admin.tabLines'), icon: '🏭' },
  { key: 'products', label: t('admin.tabProducts'), icon: '🧴' },
  { key: 'races', label: t('admin.tabRaces'), icon: '🏁' },
  { key: 'settings', label: t('admin.tabSettings'), icon: '⚙️' },
  { key: 'reports', label: t('admin.tabReports'), icon: '📊' },
];

/**
 * Admin console shell.
 *
 * All six panels are mounted once and simply hidden/shown, so switching tabs
 * never loses in-progress form state — a supervisor editing a product's pallet
 * sizes can glance at the roster and come back without losing the draft.
 */
export function AdminTabs({
  workers,
  lines,
  products,
  palletSizes,
  races,
  summaries,
  leaderboard,
  settings,
}: {
  workers: Worker[];
  lines: ProductionLine[];
  products: Product[];
  palletSizes: PalletSize[];
  races: Race[];
  summaries: RaceSummary[];
  leaderboard: RaceLeaderboard;
  settings: RuntimeSettings;
}) {
  const [tab, setTab] = useState<TabKey>('workers');

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      <h1 className="mb-1 text-3xl font-black tracking-tight text-ink">{t('admin.title')}</h1>
      <p className="mb-5 text-sm text-ink-muted">{t('app.tagline')}</p>

      {/* Tab bar — horizontally scrollable so it never wraps awkwardly on a tablet */}
      <div role="tablist" aria-label={t('admin.title')} className="mb-6 flex gap-1.5 overflow-x-auto scroll-thin">
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`panel-${item.key}`}
              id={`tab-${item.key}`}
              onClick={() => setTab(item.key)}
              className={[
                'inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors',
                active ? 'bg-brand-600 text-white shadow-card' : 'bg-white text-ink-soft hover:bg-surface-muted',
              ].join(' ')}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <div className={tab === 'workers' ? '' : 'hidden'}>
          <WorkersPanel initialWorkers={workers} />
        </div>
        <div className={tab === 'lines' ? '' : 'hidden'}>
          <LinesPanel initialLines={lines} />
        </div>
        <div className={tab === 'products' ? '' : 'hidden'}>
          <ProductsPanel initialProducts={products} initialPalletSizes={palletSizes} />
        </div>
        <div className={tab === 'races' ? '' : 'hidden'}>
          <RacesPanel
            initialRaces={races}
            initialLeaderboard={leaderboard}
            initialSummaries={summaries}
            products={products}
            defaultMinHours={settings.defaultMinRaceHours}
          />
        </div>
        <div className={tab === 'settings' ? '' : 'hidden'}>
          <SettingsPanel initial={settings} />
        </div>
        <div className={tab === 'reports' ? '' : 'hidden'}>
          <ReportsPanel />
        </div>
      </div>
    </div>
  );
}
