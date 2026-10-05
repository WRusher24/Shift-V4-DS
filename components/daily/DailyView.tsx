'use client';

import { useCallback, useEffect, useState } from 'react';

import type { DailyStats } from '@/lib/domain/types';
import { formatClock, formatDate, formatDateKey, formatInt, formatPercent, formatPoints } from '@/lib/domain/format';
import { t } from '@/lib/i18n/he';
import { api, downloadCsv } from '@/lib/client/api';
import { Alert, Badge, Button, EmptyState, ProgressBar, SectionHeader, StatTile } from '@/components/ui/primitives';
import { Field, TextInput } from '@/components/ui/fields';

/**
 * Daily production screen.
 *
 * Deliberately **pallet-first**: pallets are the unit the floor counts and
 * carries, so the headline figure and the primary ranking are pallet counts.
 * Cartons and points are shown alongside rather than in front.
 *
 * The per-product table answers the question a shift supervisor actually asks —
 * "how many pallets of each product did we get out today" — and the same panel
 * is part of the TV Mode loop, so the answer is on the wall as well as on screen.
 */
export function DailyView({ initial, initialDate }: { initial: DailyStats; initialDate: string }) {
  const [stats, setStats] = useState<DailyStats>(initial);
  const [date, setDate] = useState(initialDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (value: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.get<DailyStats>(`/api/daily?date=${encodeURIComponent(value)}`);
      setStats(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.unknownError'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch whenever the selected day changes.
  useEffect(() => {
    if (date === initialDate) return;
    void load(date);
  }, [date, initialDate, load]);

  const today = formatDateKey(new Date());
  const yesterday = formatDateKey(new Date(Date.now() - 86400000));

  const peakHour = stats.byHour.reduce(
    (best, hour) => (hour.pallets > best.pallets ? hour : best),
    { hour: 0, pallets: 0, cartons: 0 },
  );
  const maxHourPallets = stats.byHour.reduce((max, hour) => Math.max(max, hour.pallets), 0);
  const activeHours = Math.max(1, stats.byHour.filter((hour) => hour.pallets > 0).length);
  const topProduct = stats.byProduct[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      <SectionHeader
        level={1}
        title={t('daily.title')}
        subtitle={t('daily.subtitle')}
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => downloadCsv(`/api/reports/daily?date=${encodeURIComponent(date)}`)}
              icon="⬇"
            >
              {t('daily.exportCsv')}
            </Button>
            <Button variant="primary" onClick={() => void load(date)} loading={loading} icon="↻">
              {t('common.refresh')}
            </Button>
          </>
        }
      />

      {/* Date selector */}
      <section className="card card-pad mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[200px]">
            <Field label={t('daily.selectDate')}>
              <TextInput
                type="date"
                freeText={false}
                value={date}
                max={today}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2 pb-4">
            <Button
              variant={date === today ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setDate(today)}
            >
              {t('daily.today')}
            </Button>
            <Button
              variant={date === yesterday ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setDate(yesterday)}
            >
              {t('daily.yesterday')}
            </Button>
            <Badge tone="neutral" icon="📅">
              {formatDate(stats.dateKey)}
            </Badge>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-5">
          <Alert tone="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        </div>
      ) : null}

      {/* ------------------------------------------------ headline: pallets */}
      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-stretch">
          <div className="flex min-w-[260px] flex-1 items-center gap-5 bg-live-50 px-6 py-6">
            <span aria-hidden className="text-6xl">
              📦
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-live-700">
                {t('daily.palletsProduced')}
              </p>
              <p className="numeric text-7xl font-black leading-none text-live-600 sm:text-8xl">
                {formatInt(stats.totals.pallets)}
              </p>
              <p className="mt-1 text-sm font-bold text-live-700">{t('daily.pallets')}</p>
            </div>
          </div>

          <div className="flex min-w-[170px] items-center gap-4 border-s border-surface-line px-6 py-6">
            <span aria-hidden className="text-3xl">
              🧃
            </span>
            <div>
              <p className="stat-label">{t('daily.cartons')}</p>
              <p className="numeric text-4xl font-black leading-none text-brand-600">
                {formatInt(stats.totals.cartons)}
              </p>
            </div>
          </div>

          <div className="flex min-w-[170px] items-center gap-4 border-s border-surface-line px-6 py-6">
            <span aria-hidden className="text-3xl">
              ⭐
            </span>
            <div>
              <p className="stat-label">{t('daily.points')}</p>
              <p className="numeric text-4xl font-black leading-none text-live-600">
                {formatPoints(stats.totals.points)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Secondary metrics */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t('daily.batchesRunning')}
          value={formatInt(stats.totals.batchesRunning)}
          tone="live"
          icon="🏭"
          hint={`${formatInt(stats.totals.batchesCompleted)} ${t('daily.batchesCompleted')}`}
        />
        <StatTile
          label={t('daily.activeTime')}
          value={formatClock(stats.totals.activeSeconds)}
          icon="⏱"
        />
        <StatTile
          label={t('daily.pausedTime')}
          value={formatClock(stats.totals.pausedSeconds)}
          tone="paused"
          icon="⏸"
        />
        <StatTile
          label={t('daily.workersOnFloor')}
          value={formatInt(stats.totals.workersOnFloor)}
          icon="👷"
          hint={topProduct ? `${t('daily.topProduct')}: ${topProduct.productName}` : undefined}
        />
      </div>

      {/* --------------------------------------------------- per product */}
      <section className="card mb-6 overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-line bg-surface-muted/70 px-5 py-3.5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-ink">
              <span aria-hidden>📦</span>
              {t('daily.byProduct')}
            </h2>
            <p className="text-xs text-ink-muted">{t('daily.byProductHint')}</p>
          </div>
          <Badge tone="live">{formatInt(stats.byProduct.length)}</Badge>
        </header>

        {stats.byProduct.length === 0 ? (
          <div className="p-5">
            <EmptyState icon="📦" title={t('daily.noProduction')} hint={t('daily.noProductionHint')} />
          </div>
        ) : (
          <div className="table-wrap rounded-none border-0">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-12 text-center">#</th>
                  <th>{t('daily.byProduct')}</th>
                  <th className="text-end">{t('daily.pallets')}</th>
                  <th className="text-end">{t('daily.cartons')}</th>
                  <th className="text-end">{t('daily.points')}</th>
                  <th className="w-48">{t('daily.share')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.byProduct.map((row, index) => (
                  <tr key={row.productId}>
                    <td className="numeric text-center font-black text-ink-muted">{formatInt(index + 1)}</td>
                    <td>
                      <span className="block font-bold text-ink">{row.productName}</span>
                      <span className="block text-xs text-ink-muted">{row.sizeLabel}</span>
                    </td>
                    <td className="numeric text-end">
                      <span className="text-3xl font-black leading-none text-live-600">
                        {formatInt(row.pallets)}
                      </span>
                    </td>
                    <td className="numeric text-end text-brand-600">{formatInt(row.cartons)}</td>
                    <td className="numeric text-end text-ink-soft">{formatPoints(row.points)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={row.share} max={1} tone="live" />
                        <span className="numeric w-12 shrink-0 text-end text-xs font-bold text-ink-muted">
                          {formatPercent(row.share)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* -------------------------------------------- per line + hourly curve */}
      <div className="mb-6 grid gap-5 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <header className="border-b border-surface-line bg-surface-muted/70 px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-lg font-black text-ink">
              <span aria-hidden>🏭</span>
              {t('daily.byLine')}
            </h2>
          </header>

          {stats.byLine.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-ink-muted">{t('common.empty')}</p>
          ) : (
            <ul className="divide-y divide-surface-line">
              {stats.byLine.map((line) => (
                <li key={line.lineId} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-surface-sunken px-2 text-sm font-black text-ink-soft">
                    {line.lineCode}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{line.lineName}</span>
                    <span className="numeric block text-xs text-ink-muted">
                      {formatClock(line.activeSeconds)} {t('daily.activeTime')} ·{' '}
                      {formatClock(line.pausedSeconds)} {t('daily.pausedTime')}
                    </span>
                  </span>
                  {line.batchesRunning > 0 ? (
                    <Badge tone="live" icon="●">
                      {formatInt(line.batchesRunning)} {t('daily.batchesRunning')}
                    </Badge>
                  ) : null}
                  <span className="text-end">
                    <span className="numeric block text-2xl font-black leading-none text-live-600">
                      {formatInt(line.pallets)}
                    </span>
                    <span className="block text-[11px] font-bold text-ink-muted">{t('daily.pallets')}</span>
                  </span>
                  <span className="text-end">
                    <span className="numeric block text-lg font-black leading-none text-brand-600">
                      {formatInt(line.cartons)}
                    </span>
                    <span className="block text-[11px] font-bold text-ink-muted">{t('daily.cartons')}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-line bg-surface-muted/70 px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-lg font-black text-ink">
              <span aria-hidden>📈</span>
              {t('daily.byHour')}
            </h2>
            <span className="text-xs font-bold text-ink-muted">
              {t('daily.peakHour')}: <span className="numeric">{formatInt(peakHour.hour)}:00</span> ·{' '}
              {t('daily.avgPerHour')}:{' '}
              <span className="numeric">{formatInt(Math.round(stats.totals.pallets / activeHours))}</span>
            </span>
          </header>

          <div className="p-5">
            <HourChart hours={stats.byHour} max={maxHourPallets} />
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------ top workers */}
      <section className="card overflow-hidden">
        <header className="border-b border-surface-line bg-surface-muted/70 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-lg font-black text-ink">
            <span aria-hidden>👷</span>
            {t('daily.topWorkers')}
          </h2>
        </header>

        {stats.topWorkers.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-ink-muted">{t('common.empty')}</p>
        ) : (
          <div className="table-wrap rounded-none border-0">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-12 text-center">#</th>
                  <th>{t('leaderboard.worker')}</th>
                  <th className="text-end">{t('daily.pallets')}</th>
                  <th className="text-end">{t('daily.cartons')}</th>
                  <th className="text-end">{t('daily.points')}</th>
                  <th className="text-end">{t('daily.activeTime')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.topWorkers.map((row, index) => (
                  <tr key={row.worker.workerId}>
                    <td className="numeric text-center font-black text-ink-muted">{formatInt(index + 1)}</td>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden className="text-2xl leading-none">
                          {row.worker.emoji}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-ink">{row.worker.fullName}</span>
                          <span className="numeric block text-xs text-ink-muted">
                            #{row.worker.employeeId}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="numeric text-end font-bold text-live-600">{formatInt(row.pallets)}</td>
                    <td className="numeric text-end text-ink-soft">{formatInt(row.cartons)}</td>
                    <td className="numeric text-end font-black text-brand-600">{formatPoints(row.points)}</td>
                    <td className="numeric text-end text-ink-soft">{formatClock(row.activeSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-5 text-center text-xs text-ink-muted">
        {t('common.total')}: <span className="numeric">{formatInt(stats.totals.pallets)}</span>{' '}
        {t('daily.pallets')} · <span className="numeric">{formatInt(stats.totals.cartons)}</span>{' '}
        {t('daily.cartons')} · <span className="numeric">{formatPoints(stats.totals.points)}</span>{' '}
        {t('daily.points')}
      </p>
    </div>
  );
}

/**
 * Hour-of-day production curve.
 *
 * Hand-rolled SVG rather than a charting dependency: it keeps the bundle small,
 * renders identically on every factory tablet, and guarantees Western digits on
 * the axis labels.
 */
function HourChart({ hours, max }: { hours: DailyStats['byHour']; max: number }) {
  const width = 640;
  const height = 180;
  const barGap = 2;
  const barWidth = (width - barGap * (hours.length - 1)) / hours.length;
  const scale = max > 0 ? (height - 28) / max : 0;

  return (
    <div className="w-full overflow-x-auto scroll-thin">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[180px] w-full min-w-[560px]"
        role="img"
        aria-label={t('daily.byHour')}
      >
        {/* Baseline */}
        <line x1={0} y1={height - 20} x2={width} y2={height - 20} stroke="#d7dee8" strokeWidth={1} />

        {hours.map((hour, index) => {
          // SVG is left-to-right; hours still read 00 -> 23 left to right, which
          // is the convention on every charting tool the factory already uses.
          const x = index * (barWidth + barGap);
          const barHeight = Math.max(hour.pallets > 0 ? 3 : 0, hour.pallets * scale);
          const y = height - 20 - barHeight;
          const isPeak = max > 0 && hour.pallets === max;

          return (
            <g key={hour.hour}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={3}
                fill={isPeak ? '#10b981' : hour.pallets > 0 ? '#93c5fd' : '#e9edf3'}
              />
              {index % 3 === 0 ? (
                <text
                  x={x + barWidth / 2}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={700}
                  fill="#64748b"
                >
                  {String(hour.hour).padStart(2, '0')}
                </text>
              ) : null}
              {isPeak ? (
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={800}
                  fill="#047857"
                >
                  {String(hour.pallets)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
