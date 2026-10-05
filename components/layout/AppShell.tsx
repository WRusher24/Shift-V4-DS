'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { t } from '@/lib/i18n/he';
import { useIdle } from '@/lib/client/hooks/useIdle';
import { useStationState } from '@/lib/client/hooks/useStationState';
import { projectBatchView } from '@/lib/client/hooks/useLiveTimer';
import { TvMode } from '@/components/tv/TvMode';

const NAV_ITEMS = [
  { href: '/', labelKey: 'nav.station' as const, icon: '🏭' },
  { href: '/daily', labelKey: 'nav.daily' as const, icon: '📅' },
  { href: '/leaderboard', labelKey: 'nav.leaderboard' as const, icon: '🏆' },
  { href: '/history', labelKey: 'nav.history' as const, icon: '🗂️' },
  { href: '/admin', labelKey: 'nav.admin' as const, icon: '⚙️' },
];

interface HealthPayload {
  storage: string;
  storageKind: 'drizzle' | 'local';
}

/**
 * Application chrome, and the owner of the **global** TV Mode.
 *
 * TV Mode used to live on the station dashboard only, which meant a wall display
 * parked on the leaderboard or the daily screen never went idle. It now lives
 * here, in the layout, so it engages after the configured inactivity period on
 * **any** page, and any mouse, keyboard or touch action anywhere in the app
 * restores the interactive view instantly.
 *
 * The station payload is polled here rather than in each page, so the TV board
 * always has fresh data regardless of which screen the display was left on.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { state, driftSeconds } = useStationState();

  /**
   * Suppress TV Mode while a modal is open. Observed via a data attribute rather
   * than a shared context, so the shell stays decoupled from whichever component
   * tree opened the dialog.
   */
  useEffect(() => {
    const read = () => setModalOpen(document.body.dataset.shiftModal === '1');
    read();

    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-shift-modal'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: HealthPayload | null) => {
        if (!cancelled && payload) setHealth(payload);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const idleTimeoutMs = (state?.idleSeconds ?? 10) * 1000;
  const { isIdle } = useIdle(idleTimeoutMs, { enabled: Boolean(state) && !modalOpen });

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // ---------------------------------------------------------------- TV Mode
  if (isIdle && state && !modalOpen) {
    // Project every station forward locally so the TV timers tick smoothly
    // between polls, exactly as they do on the station screen.
    const projected = {
      ...state,
      stations: state.stations.map((station) => ({
        ...station,
        batch: projectBatchView(station.batch, driftSeconds),
      })),
    };
    return <TvMode state={projected} driftSeconds={driftSeconds} />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-40 border-b border-surface-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-black text-white shadow-card"
            >
              ⚙
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-xl font-black tracking-tight text-ink">{t('app.name')}</span>
              <span className="hidden text-[11px] font-semibold text-ink-muted sm:block">
                {t('app.tagline')}
              </span>
            </span>
          </Link>

          {/* Primary navigation */}
          <nav aria-label="ניווט ראשי" className="order-3 w-full sm:order-2 sm:w-auto">
            <ul className="flex items-center gap-1.5 overflow-x-auto scroll-thin">
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-colors',
                        active ? 'bg-brand-600 text-white shadow-card' : 'text-ink-soft hover:bg-surface-muted',
                      ].join(' ')}
                    >
                      <span aria-hidden className="text-base">
                        {item.icon}
                      </span>
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Storage indicator */}
          <div className="order-2 ms-auto flex items-center gap-2 sm:order-3">
            {state?.activeRace ? (
              <span className="badge badge-brand hidden md:inline-flex" title={state.activeRace.name}>
                <span aria-hidden>🏁</span>
                <span className="max-w-[180px] truncate">{state.activeRace.name}</span>
              </span>
            ) : null}

            {health ? (
              <span
                className={`badge ${health.storageKind === 'drizzle' ? 'badge-live' : 'badge-paused'}`}
                title={health.storage}
              >
                <span aria-hidden>{health.storageKind === 'drizzle' ? '🗄️' : '💾'}</span>
                {health.storageKind === 'drizzle' ? 'PostgreSQL' : 'אחסון מקומי'}
              </span>
            ) : (
              <span className="badge badge-neutral">…</span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="no-print border-t border-surface-line bg-white px-4 py-4 text-center text-xs text-ink-muted sm:px-6">
        {t('app.name')} · {t('app.factory')} · כל הזמנים מוצגים לפי שעון המכשיר
      </footer>
    </div>
  );
}
