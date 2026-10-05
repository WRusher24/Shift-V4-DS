'use client';

import { useEffect, useMemo, useState } from 'react';

import type { DailyStats, StationState, StationView } from '@/lib/domain/types';
import {
  formatClock,
  formatDate,
  formatInt,
  formatPoints,
  formatRate,
  formatTime,
} from '@/lib/domain/format';
import { pauseReasonLabel, t } from '@/lib/i18n/he';
import { api } from '@/lib/client/api';

/** Fallback panel duration when the setting is unavailable. */
const DEFAULT_SLIDE_SECONDS = 8;

/**
 * Idle "TV Mode" — a full-screen digital scoreboard.
 *
 * Owned by the app shell, so it engages on **any** page after the configured
 * inactivity period.
 *
 * The rotation is administrator-configurable: `state.tvPanels` carries the
 * ordered list of panels chosen in the settings screen, so a site that does not
 * want the efficiency board (or wants *only* the daily board) can say so. An
 * empty list means the administrator deliberately disabled TV Mode content, and
 * the overlay says so rather than showing a blank screen.
 *
 * Panel duration comes from the `tv_slide_seconds` setting (default 8 s). Any
 * mouse movement, click, touch or key press exits immediately — the idle listener
 * lives in the app shell, which simply unmounts this component.
 */
export function TvMode({ state, driftSeconds }: { state: StationState; driftSeconds: number }) {
  const [panelIndex, setPanelIndex] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const [daily, setDaily] = useState<DailyStats | null>(null);

  const panels = state.tvPanels;
  const panelCount = panels.length;
  const slideSeconds = Math.max(3, state.tvSlideSeconds || DEFAULT_SLIDE_SECONDS);
  const panelDurationMs = slideSeconds * 1000;

  // Panel rotation — restarts whenever the duration or the panel list changes.
  useEffect(() => {
    if (panelCount === 0) return;
    const timer = window.setInterval(() => {
      setPanelIndex((previous) => (previous + 1) % panelCount);
    }, panelDurationMs);
    return () => window.clearInterval(timer);
  }, [panelDurationMs, panelCount]);

  // Keep the index in range if an administrator removes panels while the board
  // is on screen.
  useEffect(() => {
    if (panelCount === 0) setPanelIndex(0);
    else if (panelIndex >= panelCount) setPanelIndex(0);
  }, [panelCount, panelIndex]);

  // Wall clock in the header.
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // The daily board needs its own payload; refreshed once a minute, which is far
  // more often than the panel rotates.
  useEffect(() => {
    if (!panels.includes('daily')) return;

    let cancelled = false;
    const load = () => {
      api
        .get<DailyStats>('/api/daily')
        .then((payload) => {
          if (!cancelled) setDaily(payload);
        })
        .catch(() => undefined);
    };

    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [panels]);

  const activeStations = useMemo(
    () => state.stations.filter((station) => station.batch !== null),
    [state.stations],
  );

  const currentPanel = panelCount > 0 ? panels[Math.min(panelIndex, panelCount - 1)] : null;

  return (
    <div className="tv-stage tv-grid fixed inset-0 z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-brand-200 bg-white/85 px-6 py-4 backdrop-blur sm:px-10">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-3xl text-white shadow-card"
          >
            ⚙
          </span>
          <div>
            <h1 className="text-3xl font-black leading-tight text-ink sm:text-4xl">{t('tv.title')}</h1>
            <p className="text-sm font-bold text-ink-muted">
              {state.activeRace ? `${t('tv.raceLabel')}: ${state.activeRace.name}` : t('leaderboard.noRace')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {state.activeRace?.prizeDescription ? (
            <div className="hidden text-end sm:block">
              <p className="stat-label">{t('tv.prizeLabel')}</p>
              <p className="max-w-xs truncate text-lg font-black text-brand-700">
                {state.activeRace.prizeDescription}
              </p>
            </div>
          ) : null}
          <div className="text-end">
            <p className="stat-label">{formatDate(clock)}</p>
            <p className="numeric text-4xl font-black leading-none text-ink sm:text-5xl">
              {formatTime(clock)}
            </p>
          </div>
        </div>
      </header>

      {/* Panel */}
      <div className="flex-1 overflow-hidden px-6 py-6 sm:px-10">
        {currentPanel === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span aria-hidden className="text-5xl">
              🖥️
            </span>
            <p className="text-3xl font-black text-ink-muted">{t('admin.settings.tvPanelsNone')}</p>
            <p className="text-lg text-ink-muted">{t('admin.settings.tvPanelsHint')}</p>
          </div>
        ) : null}
        {currentPanel === 'leaderboard_volume' ? <VolumePanel state={state} /> : null}
        {currentPanel === 'leaderboard_efficiency' ? <EfficiencyPanel state={state} /> : null}
        {currentPanel === 'active_batches' ? (
          <ActiveBatchesPanel stations={activeStations} driftSeconds={driftSeconds} />
        ) : null}
        {currentPanel === 'daily' ? <DailyPanel daily={daily} /> : null}
        {currentPanel === 'race_stats' ? <RaceScoreboardPanel state={state} /> : null}
      </div>

      {/* Footer: rotation progress + exit hint */}
      <footer className="border-t-2 border-brand-200 bg-white/85 px-6 py-3 backdrop-blur sm:px-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {panels.map((key, index) => (
              <span
                key={key}
                title={t(`tv.panel.${key}` as 'tv.panel.daily')}
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  index === panelIndex ? 'w-10 bg-brand-600' : 'w-2.5 bg-surface-line'
                }`}
              />
            ))}
          </div>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            {panelCount > 0 ? (
              <div
                key={`${panelIndex}-${slideSeconds}-${panelCount}`}
                className="tv-progress h-full rounded-full bg-brand-500"
                style={{ animationDuration: `${panelDurationMs}ms` }}
              />
            ) : null}
          </div>
          {panelCount > 0 ? (
            <p className="hidden text-xs font-bold text-ink-muted lg:block">
              {t('tv.panel', { index: formatInt(panelIndex + 1), total: formatInt(panelCount) })} ·{' '}
              {t('tv.slideSeconds', { seconds: formatInt(slideSeconds) })}
            </p>
          ) : null}
          <p className="hidden text-xs font-bold text-ink-muted sm:block">{t('tv.hint')}</p>
        </div>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Panels                                                                    */
/* -------------------------------------------------------------------------- */

function PanelFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full animate-ticker-in flex-col">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-4xl font-black tracking-tight text-ink sm:text-5xl">{title}</h2>
        {subtitle ? <p className="text-lg font-bold text-ink-muted">{subtitle}</p> : null}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function VolumePanel({ state }: { state: StationState }) {
  const rows = state.leaderboard.byVolume.slice(0, 8);
  const max = rows.reduce((value, row) => Math.max(value, row.points), 0);

  return (
    <PanelFrame title={`🏆 ${t('tv.volumeBoard')}`} subtitle={t('leaderboard.volumeHint')}>
      {rows.length === 0 ? (
        <p className="text-2xl font-bold text-ink-muted">{t('tv.noData')}</p>
      ) : (
        <ul className="grid h-full content-start gap-3">
          {rows.map((row, index) => (
            <li
              key={row.worker.workerId}
              className="flex items-center gap-4 rounded-2xl border border-surface-line bg-white/90 px-5 py-3 shadow-card"
              style={{ animation: `ticker-in 0.5s cubic-bezier(0.16,1,0.3,1) ${index * 70}ms both` }}
            >
              <span
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-black ${
                  index === 0
                    ? 'bg-safety-100 text-safety-700'
                    : index === 1
                      ? 'bg-surface-sunken text-ink-soft'
                      : index === 2
                        ? 'bg-safety-50 text-safety-600'
                        : 'bg-surface-muted text-ink-muted'
                }`}
              >
                {index < 3 ? <span aria-hidden>{['🥇', '🥈', '🥉'][index]}</span> : formatInt(row.rank)}
              </span>

              <span aria-hidden className="text-5xl leading-none">
                {row.worker.emoji}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-2xl font-black text-ink sm:text-3xl">
                  {row.worker.fullName}
                </span>
                <span className="mt-1.5 block h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <span
                    className="block h-full animate-bar-grow rounded-full bg-brand-500"
                    style={{
                      width: `${max > 0 ? Math.max(3, (row.points / max) * 100) : 0}%`,
                      transformOrigin: 'inline-start',
                    }}
                  />
                </span>
              </span>

              <span className="shrink-0 text-end">
                <span className="numeric block text-4xl font-black leading-none text-brand-600 sm:text-5xl">
                  {formatPoints(row.points)}
                </span>
                <span className="numeric block text-sm font-bold text-ink-muted">
                  {formatInt(row.cartons)} {t('leaderboard.cartons')} · {formatRate(row.activeHours)}{' '}
                  {t('leaderboard.hours')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelFrame>
  );
}

function EfficiencyPanel({ state }: { state: StationState }) {
  const rows = state.leaderboard.byEfficiency.slice(0, 8);
  const max = rows.reduce((value, row) => Math.max(value, row.pointsPerHour), 0);

  return (
    <PanelFrame
      title={`⚡ ${t('tv.efficiencyBoard')}`}
      subtitle={t('leaderboard.minHoursValue', { hours: formatInt(state.leaderboard.minActiveHours) })}
    >
      {rows.length === 0 ? (
        <p className="text-2xl font-bold text-ink-muted">{t('tv.noData')}</p>
      ) : (
        <ul className="grid h-full content-start gap-3">
          {rows.map((row, index) => (
            <li
              key={row.worker.workerId}
              className={`flex items-center gap-4 rounded-2xl border px-5 py-3 shadow-card ${
                row.qualified ? 'border-live-200 bg-white/90' : 'border-surface-line bg-white/60'
              }`}
              style={{ animation: `ticker-in 0.5s cubic-bezier(0.16,1,0.3,1) ${index * 70}ms both` }}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-muted text-2xl font-black text-ink-muted">
                {index < 3 ? <span aria-hidden>{['🥇', '🥈', '🥉'][index]}</span> : formatInt(row.rank)}
              </span>

              <span aria-hidden className="text-5xl leading-none">
                {row.worker.emoji}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-2xl font-black text-ink sm:text-3xl">
                  {row.worker.fullName}
                </span>
                <span className="mt-1.5 block h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <span
                    className="block h-full animate-bar-grow rounded-full bg-live-500"
                    style={{
                      width: `${max > 0 ? Math.max(3, (row.pointsPerHour / max) * 100) : 0}%`,
                      transformOrigin: 'inline-start',
                    }}
                  />
                </span>
              </span>

              <span className="shrink-0 text-end">
                <span className="numeric block text-4xl font-black leading-none text-live-600 sm:text-5xl">
                  {formatRate(row.pointsPerHour)}
                </span>
                <span className="block text-sm font-bold text-ink-muted">
                  {t('leaderboard.pph')}
                  {row.qualified ? '' : ` · ${t('leaderboard.notQualified')}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelFrame>
  );
}

function ActiveBatchesPanel({
  stations,
  driftSeconds,
}: {
  stations: StationView[];
  driftSeconds: number;
}) {
  return (
    <PanelFrame title={`🏭 ${t('tv.activeBatches')}`} subtitle={t('station.subtitle')}>
      {stations.length === 0 ? (
        <p className="text-2xl font-bold text-ink-muted">{t('station.lineEmpty')}</p>
      ) : (
        <div
          className={`grid h-full content-start gap-5 ${
            stations.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
          }`}
        >
          {stations.map((station) => {
            const view = station.batch;
            if (!view) return null;

            const elapsed = view.stats.elapsedSeconds + driftSeconds;
            const paused = view.stats.pausedSeconds + (view.stats.isPaused ? driftSeconds : 0);
            const active = Math.max(0, elapsed - paused);
            const members = view.members.filter((member) => member.isCurrentlyActive);

            return (
              <article
                key={view.batch.id}
                className={`flex flex-col gap-4 rounded-3xl border-2 bg-white/92 p-6 shadow-card ${
                  view.stats.isPaused ? 'border-safety-300' : 'border-live-300'
                }`}
              >
                <header className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-12 shrink-0 items-center justify-center rounded-2xl px-3 text-xl font-black text-white ${
                        view.stats.isPaused ? 'bg-safety-500' : 'bg-live-600'
                      }`}
                    >
                      {station.line.code}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink-muted">{station.line.name}</p>
                      <h3 className="truncate text-2xl font-black text-ink">{view.product.name}</h3>
                    </div>
                  </div>
                  {view.stats.isPaused ? (
                    <span className="badge badge-paused text-sm">
                      ⏸ {view.stats.activePause ? pauseReasonLabel(view.stats.activePause.reasonCode) : ''}
                    </span>
                  ) : (
                    <span className="badge badge-live text-sm">● {t('station.running')}</span>
                  )}
                </header>

                <p
                  className={`numeric text-center text-6xl font-black leading-none sm:text-7xl ${
                    view.stats.isPaused ? 'text-safety-600' : 'text-live-600'
                  }`}
                >
                  {formatClock(elapsed)}
                </p>

                <dl className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-surface-muted px-2 py-2">
                    <dt className="stat-label">{t('station.palletsLogged')}</dt>
                    <dd className="numeric text-2xl font-black text-brand-600">
                      {formatInt(view.stats.palletCount)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-surface-muted px-2 py-2">
                    <dt className="stat-label">{t('station.points')}</dt>
                    <dd className="numeric text-2xl font-black text-live-600">
                      {formatPoints(view.stats.totalPoints)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-surface-muted px-2 py-2">
                    <dt className="stat-label">{t('station.activeTime')}</dt>
                    <dd className="numeric text-2xl font-black text-ink">{formatClock(active)}</dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2">
                  {members.map((member) => (
                    <span
                      key={member.memberId}
                      className="flex items-center gap-2 rounded-xl border border-live-200 bg-live-50 px-3 py-1.5 text-lg font-bold text-ink"
                    >
                      <span aria-hidden className="text-2xl">
                        {member.emoji}
                      </span>
                      {member.fullName}
                    </span>
                  ))}
                </div>

                {view.activeRaceNames.length > 0 ? (
                  <p className="text-xs font-bold text-ink-muted">
                    {t('station.racesAttributionList', { races: view.activeRaceNames.join(' · ') })}
                  </p>
                ) : (
                  <p className="text-xs font-bold text-safety-600">{t('station.noActiveRace')}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </PanelFrame>
  );
}

/**
 * Daily production board — pallets per product.
 *
 * This is the panel the floor actually reads: "how many pallets of *this*
 * product did we get out today". Cartons and points are secondary.
 */
function DailyPanel({ daily }: { daily: DailyStats | null }) {
  const rows = daily?.byProduct ?? [];
  const max = rows.reduce((value, row) => Math.max(value, row.pallets), 0);

  return (
    <PanelFrame
      title={`📅 ${t('tv.dailyBoard')}`}
      subtitle={
        daily
          ? `${t('daily.palletsProduced')}: ${formatInt(daily.totals.pallets)} · ${formatInt(
              daily.totals.cartons,
            )} ${t('daily.cartons')}`
          : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-2xl font-bold text-ink-muted">{t('daily.noProduction')}</p>
      ) : (
        <ul className="grid h-full content-start gap-3">
          {rows.slice(0, 8).map((row, index) => (
            <li
              key={row.productId}
              className="flex items-center gap-4 rounded-2xl border border-surface-line bg-white/90 px-5 py-3 shadow-card"
              style={{ animation: `ticker-in 0.5s cubic-bezier(0.16,1,0.3,1) ${index * 70}ms both` }}
            >
              <span aria-hidden className="text-4xl leading-none">
                📦
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-2xl font-black text-ink sm:text-3xl">
                  {row.productName}
                </span>
                <span className="text-sm font-bold text-ink-muted">{row.sizeLabel}</span>
                <span className="mt-1.5 block h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <span
                    className="block h-full animate-bar-grow rounded-full bg-live-500"
                    style={{
                      width: `${max > 0 ? Math.max(3, (row.pallets / max) * 100) : 0}%`,
                      transformOrigin: 'inline-start',
                    }}
                  />
                </span>
              </span>

              <span className="shrink-0 text-end">
                <span className="numeric block text-5xl font-black leading-none text-live-600">
                  {formatInt(row.pallets)}
                </span>
                <span className="block text-sm font-bold text-ink-muted">
                  {t('daily.pallets')} · {formatInt(row.cartons)} {t('daily.cartons')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelFrame>
  );
}

function RaceScoreboardPanel({ state }: { state: StationState }) {
  const totals = state.leaderboard.totals;
  const today = state.todayTotals;

  const tiles = [
    { label: t('leaderboard.points'), value: formatPoints(totals.points), tone: 'text-brand-600' },
    { label: t('leaderboard.cartons'), value: formatInt(totals.cartons), tone: 'text-ink' },
    { label: t('leaderboard.pallets'), value: formatInt(totals.pallets), tone: 'text-ink' },
    { label: t('leaderboard.batches'), value: formatInt(totals.batches), tone: 'text-ink' },
    { label: t('leaderboard.hours'), value: formatRate(totals.activeSeconds / 3600), tone: 'text-live-600' },
    {
      label: t('leaderboard.qualified'),
      value: `${formatInt(totals.qualifiedWorkers)}/${formatInt(totals.workers)}`,
      tone: 'text-live-600',
    },
    {
      label: `${t('daily.palletsProduced')} ${t('daily.today')}`,
      value: formatInt(today.pallets),
      tone: 'text-live-600',
    },
    {
      label: `${t('station.pausedTime')} ${t('daily.today')}`,
      value: formatClock(today.pausedSeconds),
      tone: 'text-safety-600',
    },
  ];

  return (
    <PanelFrame title={`📊 ${t('tv.factoryStats')}`} subtitle={state.activeRace?.name ?? ''}>
      <div className="grid h-full content-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile, index) => (
          <div
            key={tile.label}
            className="flex flex-col justify-center gap-2 rounded-3xl border border-surface-line bg-white/92 px-5 py-6 shadow-card"
            style={{ animation: `ticker-in 0.5s cubic-bezier(0.16,1,0.3,1) ${index * 60}ms both` }}
          >
            <span className="text-sm font-black uppercase tracking-wide text-ink-muted">{tile.label}</span>
            <span className={`numeric text-5xl font-black leading-none sm:text-6xl ${tile.tone}`}>
              {tile.value}
            </span>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}
